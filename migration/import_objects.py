#!/usr/bin/env python3
"""Isolated destination-only Storage API importer; uploads then verifies bytes.

Never targets the source or a public API URL. Do not run until DB staging has
committed and destination gateway and Storage schema have passed isolated review.
"""

import argparse
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

from restore_snapshot import read_json, validate_files


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ValueError("destination gateway redirected; refusing to forward credential")


def request(url, key, method, data=None, mime=None):
    headers = {"apikey": key, "Authorization": "Bearer " + key}
    if mime:
        headers["Content-Type"] = mime
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.build_opener(NoRedirects).open(req, timeout=30) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot")
    parser.add_argument("manifest")
    parser.add_argument("files_root")
    parser.add_argument("--isolated-destination", action="store_true", help="required explicit opt-in")
    args = parser.parse_args()
    if not args.isolated_destination:
        parser.error("--isolated-destination is required; no upload attempted")
    if os.geteuid() != 0 or not all(Path(value).resolve().is_relative_to("/opt/accounting-migration/imports/initial")
                                    for value in (args.snapshot, args.manifest, args.files_root)):
        parser.error("root-only destination files under /opt/accounting-migration/imports/initial required")
    key = os.environ.get("DESTINATION_SERVICE_ROLE_KEY")
    if not key:
        parser.error("DESTINATION_SERVICE_ROLE_KEY is required")
    try:
        snapshot, manifest = read_json(args.snapshot), read_json(args.manifest)
        validate_files(snapshot, args.files_root, manifest)
        objects = manifest["objects"] if isinstance(manifest, dict) else manifest
        metadata = {(obj.get("bucket_id", obj.get("bucket")), obj["name"]): obj for obj in snapshot["storage_objects"]}
        for obj in sorted(objects, key=lambda item: (item["bucket"], item["name"])):
            bucket, name = obj["bucket"], obj["name"]
            path = Path(args.files_root) / bucket / name
            data = path.read_bytes()
            mime = (metadata[(bucket, name)].get("metadata") or {}).get("mimetype") or "application/octet-stream"
            target = "http://gateway:8000/storage/v1/object/" + urllib.parse.quote(bucket) + "/" + urllib.parse.quote(name, safe="/")
            # POST has no upsert. Existing objects fail instead of overwriting.
            request(target, key, "POST", data, mime)
            stored = request("http://gateway:8000/storage/v1/object/authenticated/" + urllib.parse.quote(bucket) + "/" + urllib.parse.quote(name, safe="/"), key, "GET")
            if len(stored) != obj["bytes"] or hashlib.sha256(stored).hexdigest() != obj["sha256"]:
                raise ValueError("destination object verification failed")
        print("PASS: all destination objects uploaded and independently read back with matching sizes and SHA256")
        return 0
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError) as exc:
        print(f"FAIL: isolated object import ({type(exc).__name__}); investigate partial destination uploads before retry", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
