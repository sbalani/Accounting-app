#!/usr/bin/env python3
"""Fail-closed, destination-only snapshot preflight and transactional SQL staging.

No database connections. SQL contains private auth hashes: write ONLY into a
root-owned private destination directory and execute manually after review.
Storage bytes must be imported through the Storage API, not inserted into
storage.objects (whose file backend metadata is implementation-specific).
"""

import argparse
import hashlib
import json
import os
import stat
import sys
import re
from decimal import Decimal
from pathlib import Path

TABLES = (
    "workspaces", "profiles", "workspace_members", "workspace_invitations",
    "transaction_categories", "merchants", "payment_methods",
    "categorization_rules", "transfer_rules", "subscriptions",
    "transaction_tags", "transactions", "transaction_tag_assignments",
)
METADATA = ("columns", "constraints", "functions", "triggers", "indexes", "policies", "grants", "rls")
BUCKETS = {"receipts", "statements"}
FORMAT = "accounting-migration-snapshot-v1"
EXPECTED_OBJECT_COUNT = 107
EXPECTED_OBJECT_BYTES = 160093651


def require(condition, description):
    if not condition:
        raise ValueError(description)


def read_json(path):
    with Path(path).open(encoding="utf-8") as handle:
        return json.load(handle, parse_float=Decimal)


def canonical(value):
    return json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))


def validate(snapshot, destination):
    require(snapshot.get("format_version") == FORMAT, "snapshot format mismatch")
    require(snapshot.get("source_project") == "hltkduqytkgkglmevxvy", "source project mismatch")
    version = snapshot.get("server_version")
    require(isinstance(version, str) and version.startswith("17.6"), "source PostgreSQL 17.6 required")
    require(destination.get("server_version") == version, "destination PostgreSQL version mismatch")
    require(destination.get("auth_version") == "v2.197.0", "destination GoTrue version mismatch")
    for field in METADATA:
        require(isinstance(snapshot.get(field), list) and isinstance(destination.get(field), list), f"missing {field} metadata")
        require(sorted(map(canonical, snapshot[field])) == sorted(map(canonical, destination[field])), f"{field} schema mismatch")
    public = snapshot.get("public_data")
    require(isinstance(public, dict) and set(public) == set(TABLES), "public table set mismatch")
    columns = {}
    for item in snapshot["columns"]:
        require(all(item.get(k) for k in ("table_schema", "table_name", "column_name")), "incomplete column metadata")
        columns.setdefault((item["table_schema"], item["table_name"]), set()).add(item["column_name"])
    for table in TABLES:
        require(("public", table) in columns and isinstance(public[table], list), f"missing {table}")
        for row in public[table]:
            require(isinstance(row, dict) and set(row) == columns[("public", table)], f"{table} row column mismatch")
    for table, field in (("users", "auth_users"), ("identities", "auth_identities"), ("buckets", "storage_buckets")):
        schema = "storage" if table == "buckets" else "auth"
        require((schema, table) in columns and isinstance(snapshot.get(field), list), f"missing {schema}.{table}")
        for row in snapshot[field]:
            require(isinstance(row, dict) and set(row) == columns[(schema, table)], f"{field} row column mismatch")
    require(not public["transactions"], "nonzero transactions require a separate trigger/balance restore plan")
    require(all(row.get("id") for row in snapshot["auth_users"]), "user UUID missing")
    require(len({row["id"] for row in snapshot["auth_users"]}) == len(snapshot["auth_users"]), "duplicate user UUID")
    require(all(row.get("encrypted_password") for row in snapshot["auth_users"]), "password hash missing")
    require({row["id"] for row in snapshot["storage_buckets"]} == BUCKETS, "bucket set mismatch")
    require(all(row.get("public") is False for row in snapshot["storage_buckets"]), "storage must remain private")
    objects = snapshot.get("storage_objects")
    require(isinstance(objects, list) and all(isinstance(obj, dict) for obj in objects), "missing storage objects")
    keys = [(obj.get("bucket_id", obj.get("bucket")), obj.get("name")) for obj in objects]
    require(len(keys) == len(set(keys)) and all(bucket in BUCKETS and safe_key(name) for bucket, name in keys), "invalid storage object keys")
    require(len(objects) == EXPECTED_OBJECT_COUNT, "initial snapshot object count mismatch")


def safe_key(value):
    return (isinstance(value, str) and bool(value) and "\\" not in value
            and all(segment not in ("", ".", "..") for segment in value.split("/")))


def validate_files(snapshot, files_root, manifest):
    entries = manifest.get("objects") if isinstance(manifest, dict) else manifest
    require(isinstance(entries, list), "invalid object manifest")
    expected = {(obj.get("bucket_id", obj.get("bucket")), obj["name"]) for obj in snapshot["storage_objects"]}
    actual = {(obj.get("bucket"), obj.get("name")) for obj in entries}
    require(len(actual) == len(entries) and actual == expected, "object metadata/manifest mismatch")
    require(sum(obj["bytes"] for obj in entries) == EXPECTED_OBJECT_BYTES, "initial snapshot byte count mismatch")
    root = Path(files_root)
    require(root.is_dir() and not root.is_symlink(), "invalid object root")
    for bucket in BUCKETS:
        require((root / bucket).is_dir() and not (root / bucket).is_symlink(), "missing bucket directory")
    for obj in entries:
        bucket, name = obj["bucket"], obj["name"]
        require(bucket in BUCKETS and safe_key(name), "unsafe object key")
        path = root / bucket / name
        require(path.is_file() and not path.is_symlink(), "missing/nonregular object")
        require(path.resolve().is_relative_to(root.resolve()), "linked object ancestor")
        require(path.stat().st_size == obj["bytes"], "object byte mismatch")
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(block)
        require(digest.hexdigest() == obj["sha256"], "object SHA256 mismatch")
    found = []
    for bucket in BUCKETS:
        for base, dirs, files in os.walk(root / bucket, followlinks=False):
            require(not any((Path(base) / name).is_symlink() for name in dirs + files), "linked object")
            found.extend((bucket, (Path(base) / name).relative_to(root / bucket).as_posix()) for name in files)
    require(set(found) == actual and len(found) == len(entries), "unexpected objects in export")


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def insert_statement(schema, table, rows):
    if not rows:
        return ""
    # Populate an existing, separately reviewed schema: no inferred DDL/defaults.
    columns = sorted(rows[0])
    require(all(re.fullmatch(r"[a-z_][a-z_0-9]*", col) for col in columns), "unsafe column identifier")
    payload = json.dumps(rows, default=str, ensure_ascii=True, separators=(",", ":"))
    names = ", ".join('"' + col + '"' for col in columns)
    return f"INSERT INTO {schema}.{table} ({names}) SELECT {names} FROM jsonb_populate_recordset(NULL::{schema}.{table}, {quote(payload)}::jsonb);\n"


def render_sql(snapshot):
    parts = ["\\set ON_ERROR_STOP on\n", "BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;\n",
             "SET LOCAL lock_timeout = '5s';\n", "SET LOCAL statement_timeout = '5min';\n",
             "DO $$ BEGIN IF current_setting('server_version') <> " + quote(snapshot["server_version"]) +
             " THEN RAISE EXCEPTION 'destination PostgreSQL version mismatch'; END IF; END $$;\n"]
    for schema, table in [("auth", "users"), ("auth", "identities"), ("storage", "buckets"), ("storage", "objects")] + [("public", x) for x in TABLES]:
        parts.append(f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM {schema}.{table} LIMIT 1) THEN RAISE EXCEPTION 'destination {schema}.{table} not empty'; END IF; END $$;\n")
    parts.append("ALTER TABLE auth.users DISABLE TRIGGER USER;\n")
    parts.append(insert_statement("auth", "users", snapshot["auth_users"]))
    parts.append("ALTER TABLE auth.users ENABLE TRIGGER USER;\n")
    parts.append(insert_statement("auth", "identities", snapshot["auth_identities"]))
    parts.append(insert_statement("storage", "buckets", snapshot["storage_buckets"]))
    for table in TABLES:
        parts.append(insert_statement("public", table, snapshot["public_data"][table]))
    for schema, table, count in [("auth", "users", len(snapshot["auth_users"])), ("auth", "identities", len(snapshot["auth_identities"]))] + [("public", name, len(snapshot["public_data"][name])) for name in TABLES]:
        parts.append(f"DO $$ BEGIN IF (SELECT count(*) FROM {schema}.{table}) <> {count} THEN RAISE EXCEPTION 'row count mismatch'; END IF; END $$;\n")
    parts.append("COMMIT;\n")
    return "".join(parts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot")
    parser.add_argument("destination_schema", help="independently captured destination metadata JSON with auth_version")
    parser.add_argument("object_manifest")
    parser.add_argument("object_root")
    parser.add_argument("--sql-output", help="private SQL path, outside git (never stdout)")
    args = parser.parse_args()
    try:
        snapshot, destination = read_json(args.snapshot), read_json(args.destination_schema)
        validate(snapshot, destination)
        validate_files(snapshot, args.object_root, read_json(args.object_manifest))
        if args.sql_output:
            output = Path(args.sql_output)
            require(output.is_absolute() and not output.exists(), "SQL output must be a new absolute private path")
            require(os.geteuid() == 0 and output.is_relative_to("/opt/accounting-migration/imports/initial"),
                    "SQL may only be staged as root under the isolated destination import directory")
            parent = output.parent
            require(parent.is_dir() and stat.S_IMODE(parent.stat().st_mode) == 0o700,
                    "SQL output directory must have mode 0700")
            descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(render_sql(snapshot))
        print("PASS: snapshot/schema/auth version and exported object hashes validated; destination SQL staged" if args.sql_output else "PASS: snapshot/schema/auth version and exported object hashes validated")
        return 0
    except (ValueError, KeyError, TypeError, OSError, json.JSONDecodeError) as exc:
        print(f"FAIL: snapshot preflight ({type(exc).__name__}); no database operation", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
