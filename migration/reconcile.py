#!/usr/bin/env python3
"""Compare two private, locally generated SQL or storage manifests without printing data."""

import hashlib
import json
import os
import sys
from pathlib import Path

BUCKETS = ("receipts", "statements")


def database_manifest(path: Path):
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict) or set(value) != {
        "tables", "workspace_counts", "currency_counts", "balances", "fk_checks", "storage_counts"
    }:
        raise ValueError("Unexpected database manifest structure")
    return value


def storage_manifest(root: Path):
    result = {}
    for bucket in BUCKETS:
        folder = root / bucket
        if not folder.is_dir() or folder.is_symlink():
            raise ValueError("Missing or linked storage bucket directory")
        for base, dirs, files in os.walk(folder, followlinks=False):
            for directory in dirs:
                if (Path(base) / directory).is_symlink():
                    raise ValueError("Linked directory in storage export")
            for filename in files:
                path = Path(base) / filename
                if not path.is_file() or path.is_symlink():
                    raise ValueError("Non-regular file in storage export")
                digest = hashlib.sha256()
                with path.open("rb") as stream:
                    for block in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(block)
                result[(bucket, str(path.relative_to(folder)))] = (path.stat().st_size, digest.digest())
    return result


def canonical(value):
    if isinstance(value, list):
        return sorted((canonical(item) for item in value), key=lambda item: json.dumps(item, sort_keys=True))
    if isinstance(value, dict):
        return {key: canonical(item) for key, item in value.items()}
    return value


def main():
    if len(sys.argv) != 5:
        print("usage: reconcile.py SOURCE_DB_JSON DEST_DB_JSON SOURCE_OBJECT_DIR DEST_OBJECT_DIR", file=sys.stderr)
        return 2
    source_db, dest_db, source_dir, dest_dir = map(Path, sys.argv[1:])
    if source_db.resolve() == dest_db.resolve() or source_dir.resolve() == dest_dir.resolve():
        print("Source and destination must be distinct", file=sys.stderr)
        return 2
    try:
        source = database_manifest(source_db)
        dest = database_manifest(dest_db)
        source_objects = storage_manifest(source_dir)
        dest_objects = storage_manifest(dest_dir)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Invalid or incomplete private export ({type(exc).__name__})", file=sys.stderr)
        return 2

    mismatches = [key for key in source if canonical(source[key]) != canonical(dest[key])]
    for label, db, objects in (("source", source, source_objects), ("destination", dest, dest_objects)):
        for bucket in BUCKETS:
            db_count = sum(int(row["object_count"]) for row in db["storage_counts"] if row["bucket_id"] == bucket)
            disk_count = sum(1 for name in objects if name[0] == bucket)
            if db_count != disk_count:
                mismatches.append(f"{label}_{bucket}_database_vs_files_count")
        if any(int(count) for count in db["fk_checks"].values()):
            mismatches.append(f"{label}_fk_integrity")
    if source_objects != dest_objects:
        mismatches.append("storage_object_paths_sizes_sha256")
    if mismatches:
        print("FAIL: mismatch in " + ", ".join(mismatches))
        return 1
    print("PASS: DB counts, currency totals, balances, FK checks and object paths/bytes/SHA256 match")
    return 0


if __name__ == "__main__":
    sys.exit(main())
