#!/usr/bin/env python3
"""Isolated destination-only Storage API importer; uploads then verifies bytes.

Never targets the source or a public API URL. Do not run until DB staging has
committed and destination gateway and Storage schema have passed isolated review.
"""

import argparse
import hashlib
import json
import os
import re
import stat
import sys
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

from restore_snapshot import (EXPECTED_OBJECT_COUNT, column_specs, quote, read_json,
                              require, validate_files)

PRESERVED_FIELDS = ("owner", "owner_id", "created_at", "updated_at", "last_accessed_at", "user_metadata")


def validate_storage_metadata(snapshot):
    specs = column_specs(snapshot)
    required = {"id", "bucket_id", "name", "metadata", *PRESERVED_FIELDS}
    require(required <= set(specs.get(("storage", "objects"), {})), "missing storage.objects metadata columns")
    require(not any(specs[("storage", "objects")][field] for field in PRESERVED_FIELDS),
            "ownership/timestamp metadata is generated; needs separate review")
    objects = snapshot["storage_objects"]
    require(len(objects) == EXPECTED_OBJECT_COUNT, "storage object count mismatch")
    users = {str(user["id"]) for user in snapshot["auth_users"]}
    keys = set()
    for obj in objects:
        require(required <= set(obj), "incomplete source storage object metadata")
        bucket, name = obj["bucket_id"], obj["name"]
        require((bucket, name) not in keys, "duplicate storage object")
        keys.add((bucket, name))
        path_owner = name.split("/", 1)[0]
        require(obj["owner"] is not None and obj["owner_id"] is not None and
                str(obj["owner"]) == path_owner and str(obj["owner_id"]) == path_owner and
                path_owner in users, "storage ownership mismatch")
        require(all(obj[field] is not None for field in ("created_at", "updated_at")),
                "storage timestamps missing")
        require(isinstance(obj["metadata"], dict) and isinstance(obj["metadata"].get("mimetype"), str)
                and obj["metadata"]["mimetype"], "source storage MIME missing")
        require(obj["metadata"].get("cacheControl") == "max-age=3600",
                "source storage cache-control mismatch")
    buckets = snapshot["storage_buckets"]
    require(len(buckets) == 2 and all(row.get("public") is False for row in buckets),
            "private storage bucket metadata mismatch")
    storage_trigger_definitions(snapshot)


def storage_trigger_definitions(snapshot):
    triggers = snapshot.get("triggers")
    require(isinstance(triggers, list), "missing source trigger inventory")
    definitions = {}
    for trigger in triggers:
        if trigger.get("schema") != "storage" or trigger.get("table") != "objects":
            continue
        definition = trigger.get("definition")
        require(isinstance(definition, str), "incomplete storage trigger definition")
        for name in ("update_objects_updated_at", "protect_objects_delete"):
            if re.match(r"^CREATE TRIGGER\s+\"?" + name + r"\"?\s", definition, re.I):
                require(name not in definitions, "duplicate storage trigger definition")
                definitions[name] = definition
    require(set(definitions) == {"update_objects_updated_at", "protect_objects_delete"},
            "missing expected source storage protection/update triggers")
    require(re.fullmatch(r"CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage\.objects "
                         r"FOR EACH ROW EXECUTE FUNCTION storage\.update_updated_at_column\(\)",
                         definitions["update_objects_updated_at"], re.I) is not None,
            "unreviewed source update trigger definition")
    require(re.match(r"^CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage\.objects "
                     r"FOR EACH ROW EXECUTE FUNCTION ", definitions["protect_objects_delete"], re.I) is not None,
            "unreviewed source delete protection definition")
    return definitions


def render_storage_metadata_sql(snapshot):
    """Stage metadata-only transaction AFTER service uploads and SHA256 readback.

    Never SET id, version, version_id, backend fields, or binary/size metadata.
    """
    validate_storage_metadata(snapshot)
    objects = json.dumps(snapshot["storage_objects"], default=str, ensure_ascii=True, separators=(",", ":"))
    buckets = json.dumps(snapshot["storage_buckets"], default=str, ensure_ascii=True, separators=(",", ":"))
    triggers = storage_trigger_definitions(snapshot)
    delimiter = "$migration_storage_metadata$"
    require(delimiter not in objects + buckets, "unsafe storage metadata SQL payload")
    expected = f"jsonb_populate_recordset(NULL::storage.objects, {quote(objects)}::jsonb)"
    expected_buckets = f"jsonb_populate_recordset(NULL::storage.buckets, {quote(buckets)}::jsonb)"
    equal = " OR ".join(f't."{field}" IS DISTINCT FROM e."{field}"' for field in PRESERVED_FIELDS)
    service_fields = "to_jsonb(t)" + "".join(f" - '{field}'" for field in PRESERVED_FIELDS)
    trigger_check = (
        "IF NOT EXISTS (SELECT 1 FROM pg_trigger AS tr "
        "WHERE tr.tgrelid = 'storage.objects'::regclass AND tr.tgname = 'update_objects_updated_at' "
        "AND NOT tr.tgisinternal AND tr.tgenabled = 'O' AND tr.tgtype = 19 "
        "AND tr.tgfoid = 'storage.update_updated_at_column()'::regprocedure "
        "AND tr.tgqual IS NULL AND tr.tgnargs = 0 AND tr.tgattr::text = '' "
        f"AND pg_get_triggerdef(tr.oid) = {quote(triggers['update_objects_updated_at'])}) "
        "THEN RAISE EXCEPTION 'unexpected destination update trigger'; END IF; "
        "IF NOT EXISTS (SELECT 1 FROM pg_trigger AS tr "
        "WHERE tr.tgrelid = 'storage.objects'::regclass AND tr.tgname = 'protect_objects_delete' "
        "AND NOT tr.tgisinternal AND tr.tgenabled = 'O' AND tr.tgtype = 11 "
        f"AND pg_get_triggerdef(tr.oid) = {quote(triggers['protect_objects_delete'])}) "
        "THEN RAISE EXCEPTION 'delete protection trigger missing or changed'; END IF; ")
    return ("\\set ON_ERROR_STOP on\nBEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;\n"
            "SET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '5min';\n"
            f"DO {delimiter} BEGIN {trigger_check} "
            f"IF (SELECT count(*) FROM storage.objects) <> {len(snapshot['storage_objects'])} "
            "THEN RAISE EXCEPTION 'unexpected destination object count'; END IF; "
            f"IF EXISTS (SELECT 1 FROM {expected} AS e LEFT JOIN storage.objects AS t "
            "ON t.bucket_id = e.bucket_id AND t.name = e.name "
            "WHERE t.id IS NULL OR (t.metadata->>'mimetype') IS DISTINCT FROM (e.metadata->>'mimetype') "
            "OR (t.metadata->>'cacheControl') IS DISTINCT FROM (e.metadata->>'cacheControl')) "
            "THEN RAISE EXCEPTION 'destination object key, MIME or cache-control mismatch'; END IF; "
            f"IF (SELECT count(*) FROM storage.buckets) <> {len(snapshot['storage_buckets'])} "
            "THEN RAISE EXCEPTION 'unexpected destination bucket count'; END IF; "
            f"IF EXISTS (SELECT 1 FROM {expected_buckets} AS e LEFT JOIN storage.buckets AS t ON t.id = e.id "
            "WHERE t.id IS NULL OR t.public IS DISTINCT FROM FALSE OR to_jsonb(t) IS DISTINCT FROM to_jsonb(e)) "
            "THEN RAISE EXCEPTION 'destination private bucket metadata mismatch'; END IF; "
            f"END {delimiter};\n"
            "CREATE TEMP TABLE migration_storage_service_before ON COMMIT DROP AS "
            f"SELECT t.bucket_id, t.name, {service_fields} AS service_fields FROM storage.objects AS t;\n"
            "ALTER TABLE storage.objects DISABLE TRIGGER update_objects_updated_at;\n"
            "UPDATE storage.objects AS t SET " + ", ".join(f'"{field}" = e."{field}"' for field in PRESERVED_FIELDS) +
            f" FROM {expected} AS e WHERE t.bucket_id = e.bucket_id AND t.name = e.name;\n"
            "ALTER TABLE storage.objects ENABLE TRIGGER update_objects_updated_at;\n"
            f"DO {delimiter} BEGIN {trigger_check} "
            f"IF EXISTS (SELECT 1 FROM {expected} AS e LEFT JOIN storage.objects AS t "
            f"ON t.bucket_id = e.bucket_id AND t.name = e.name WHERE t.id IS NULL OR {equal} "
            "OR (t.metadata->>'mimetype') IS DISTINCT FROM (e.metadata->>'mimetype') "
            "OR (t.metadata->>'cacheControl') IS DISTINCT FROM (e.metadata->>'cacheControl')) "
            "THEN RAISE EXCEPTION 'destination storage metadata verification failed'; END IF; "
            "IF EXISTS (SELECT 1 FROM storage.objects AS t "
            "LEFT JOIN migration_storage_service_before AS b ON b.bucket_id = t.bucket_id AND b.name = t.name "
            f"WHERE b.name IS NULL OR {service_fields} IS DISTINCT FROM b.service_fields) "
            "THEN RAISE EXCEPTION 'service-generated storage fields changed'; END IF; "
            f"END {delimiter};\nCOMMIT;\n")


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ValueError("destination gateway redirected; refusing to forward credential")


def request(url, key, method, data=None, mime=None, cache_control=None):
    headers = {"apikey": key, "Authorization": "Bearer " + key}
    if mime:
        headers["Content-Type"] = mime
    if cache_control:
        headers["Cache-Control"] = cache_control
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.build_opener(NoRedirects).open(req, timeout=30) as response:
        return response.read(), response.headers


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot")
    parser.add_argument("manifest")
    parser.add_argument("files_root")
    parser.add_argument("--metadata-sql-output", required=True,
                        help="new root-only destination SQL path; required to preserve ownership/timestamps")
    parser.add_argument("--isolated-destination", action="store_true", help="required explicit opt-in")
    args = parser.parse_args()
    if not args.isolated_destination:
        parser.error("--isolated-destination is required; no upload attempted")
    if os.geteuid() != 0 or not all(Path(value).resolve().is_relative_to("/opt/accounting-migration/imports/initial")
                                    for value in (args.snapshot, args.manifest, args.files_root, args.metadata_sql_output)):
        parser.error("root-only destination files under /opt/accounting-migration/imports/initial required")
    key = os.environ.get("DESTINATION_SERVICE_ROLE_KEY")
    if not key:
        parser.error("DESTINATION_SERVICE_ROLE_KEY is required")
    try:
        snapshot, manifest = read_json(args.snapshot), read_json(args.manifest)
        validate_files(snapshot, args.files_root, manifest)
        validate_storage_metadata(snapshot)
        output = Path(args.metadata_sql_output)
        require(output.is_absolute() and not output.exists() and output.parent.is_dir() and
                stat.S_IMODE(output.parent.stat().st_mode) == 0o700,
                "metadata SQL must be a new file in a mode-0700 private directory")
        sql = render_storage_metadata_sql(snapshot)
        objects = manifest["objects"] if isinstance(manifest, dict) else manifest
        metadata = {(obj.get("bucket_id", obj.get("bucket")), obj["name"]): obj for obj in snapshot["storage_objects"]}
        for obj in sorted(objects, key=lambda item: (item["bucket"], item["name"])):
            bucket, name = obj["bucket"], obj["name"]
            path = Path(args.files_root) / bucket / name
            data = path.read_bytes()
            source_metadata = metadata[(bucket, name)]["metadata"]
            mime = source_metadata["mimetype"]
            cache_control = source_metadata["cacheControl"]
            target = "http://gateway:8000/storage/v1/object/" + urllib.parse.quote(bucket) + "/" + urllib.parse.quote(name, safe="/")
            # POST has no upsert. Existing objects fail instead of overwriting.
            request(target, key, "POST", data, mime, cache_control)
            stored, response_headers = request("http://gateway:8000/storage/v1/object/authenticated/" + urllib.parse.quote(bucket) + "/" + urllib.parse.quote(name, safe="/"), key, "GET")
            if len(stored) != obj["bytes"] or hashlib.sha256(stored).hexdigest() != obj["sha256"]:
                raise ValueError("destination object verification failed")
            if response_headers.get("Cache-Control") != cache_control:
                raise ValueError("destination object cache-control readback mismatch")
        descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(sql)
        print("PASS: all destination objects SHA256-readback verified; private ownership/metadata SQL staged for mandatory destination-only review and execution")
        return 0
    except (OSError, ValueError, KeyError, TypeError, urllib.error.URLError) as exc:
        print(f"FAIL: isolated object import ({type(exc).__name__}); investigate partial destination uploads before retry", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
