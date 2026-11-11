import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from restore_snapshot import TABLES, FORMAT, validate, validate_files, render_sql, insert_statement, generated_check


def sample():
    columns = []
    for table in TABLES:
        columns.append({"table_schema": "public", "table_name": table, "column_name": "id",
                        "is_generated": "NEVER", "is_identity": "NO", "identity_generation": None})
    for schema, table, fields in (("auth", "users", ["id", "encrypted_password", "confirmed_at"]),
                                   ("auth", "identities", ["id", "email"]),
                                   ("storage", "buckets", ["id", "public"])):
        columns.extend({"table_schema": schema, "table_name": table, "column_name": name,
                        "is_generated": "ALWAYS" if (table, name) in (("users", "confirmed_at"), ("identities", "email")) else "NEVER",
                        "is_identity": "NO", "identity_generation": None} for name in fields)
    snapshot = {"format_version": FORMAT, "source_project": "hltkduqytkgkglmevxvy",
                "server_version": "17.6", "captured_at": "synthetic",
                "public_data": {table: [] for table in TABLES},
                "auth_users": [{"id": "synthetic-uuid", "encrypted_password": "$2a$synthetic-not-a-password",
                                "confirmed_at": "2024-01-02T03:04:05+00:00"}],
                "auth_identities": [{"id": "synthetic-identity", "email": "fake@example.invalid"}],
                "storage_buckets": [{"id": bucket, "public": False} for bucket in ("receipts", "statements")],
                "storage_objects": [{"bucket_id": "receipts", "name": "u/w/receipt/synthetic.jpg"}]}
    for key in ("columns", "constraints", "functions", "triggers", "indexes", "policies", "grants", "rls"):
        snapshot[key] = columns if key == "columns" else []
    destination = {key: snapshot[key] for key in ("server_version", "columns", "constraints", "functions", "triggers", "indexes", "policies", "grants", "rls")}
    destination["auth_version"] = "v2.197.0"
    return snapshot, destination


class RestoreTests(unittest.TestCase):
    def test_auth_and_balance_fail_closed(self):
        snapshot, destination = sample()
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            validate(snapshot, destination)
        destination["auth_version"] = "v2.198.0"
        with self.assertRaisesRegex(ValueError, "GoTrue"):
            validate(snapshot, destination)
        destination["auth_version"] = "v2.197.0"
        snapshot["auth_users"][0]["encrypted_password"] = None
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "password"):
                validate(snapshot, destination)
        snapshot["auth_users"][0]["encrypted_password"] = "synthetic"
        snapshot["public_data"]["transactions"] = [{"id": "fake"}]
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "nonzero transactions"):
                validate(snapshot, destination)

    def test_staged_sql_disables_signup_trigger_only_inside_transaction(self):
        snapshot, destination = sample()
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            validate(snapshot, destination)
        sql = render_sql(snapshot)
        self.assertLess(sql.index("BEGIN TRANSACTION"), sql.index("DISABLE TRIGGER USER"))
        self.assertLess(sql.index("ENABLE TRIGGER USER"), sql.index("COMMIT;"))
        self.assertNotIn("storage.objects (", sql)
        self.assertNotIn("UPDATE public.payment_methods", sql)
        users_insert = next(line for line in sql.splitlines() if line.startswith("INSERT INTO auth.users"))
        identities_insert = next(line for line in sql.splitlines() if line.startswith("INSERT INTO auth.identities"))
        self.assertNotIn('"confirmed_at"', users_insert.split(" SELECT ")[0])
        self.assertNotIn('"email"', identities_insert.split(" SELECT ")[0])
        self.assertIn('t."confirmed_at" IS DISTINCT FROM expected."confirmed_at"', sql)
        self.assertIn('t."email" IS DISTINCT FROM expected."email"', sql)
        self.assertLess(sql.index("computed column mismatch in auth.users"), sql.index("COMMIT;"))

    def test_missing_or_different_generation_metadata_fails_closed(self):
        snapshot, destination = sample()
        source_column = next(c for c in snapshot["columns"] if c["column_name"] == "confirmed_at")
        source_column.pop("is_generated")
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "generation metadata"):
                validate(snapshot, destination)
        snapshot, destination = sample()
        destination["columns"] = [dict(c) for c in destination["columns"]]
        next(c for c in destination["columns"] if c["column_name"] == "email")["is_generated"] = "NEVER"
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "columns schema mismatch"):
                validate(snapshot, destination)

    def test_identity_always_omitted_and_id_generation_rejected(self):
        # Synthetic numeric identity (not an actual auth schema column).
        row = {"id": "synthetic", "ordinal": 7}
        specs = {"id": False, "ordinal": True}
        insert = insert_statement("public", "synthetic", [row], specs)
        self.assertNotIn('"ordinal"', insert.split(" SELECT ")[0])
        self.assertIn('t."ordinal" IS DISTINCT FROM expected."ordinal"',
                      generated_check("public", "synthetic", [row], specs))
        snapshot, destination = sample()
        source_id = next(c for c in snapshot["columns"] if c["table_schema"] == "auth" and c["table_name"] == "users" and c["column_name"] == "id")
        source_id.update(is_identity="YES", identity_generation="ALWAYS")
        destination["columns"] = [dict(c) for c in snapshot["columns"]]
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "stable non-generated IDs"):
                validate(snapshot, destination)

    def test_manifest_checks_content_and_extra_files(self):
        snapshot, destination = sample()
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            validate(snapshot, destination)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "receipts/u/w/receipt").mkdir(parents=True)
            (root / "statements").mkdir()
            path = root / "receipts/u/w/receipt/synthetic.jpg"
            path.write_bytes(b"synthetic")
            manifest = [{"bucket": "receipts", "name": "u/w/receipt/synthetic.jpg",
                         "bytes": 9, "sha256": hashlib.sha256(b"synthetic").hexdigest()}]
            with patch("restore_snapshot.EXPECTED_OBJECT_BYTES", 9):
                validate_files(snapshot, root, manifest)
            manifest[0]["bytes"] = 8
            with patch("restore_snapshot.EXPECTED_OBJECT_BYTES", 8):
                with self.assertRaisesRegex(ValueError, "byte mismatch"):
                    validate_files(snapshot, root, manifest)


if __name__ == "__main__":
    unittest.main()
