import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from restore_snapshot import TABLES, FORMAT, validate, validate_files, render_sql


def sample():
    columns = []
    for table in TABLES:
        columns.append({"table_schema": "public", "table_name": table, "column_name": "id"})
    for schema, table, fields in (("auth", "users", ["id", "encrypted_password"]),
                                   ("auth", "identities", ["id"]),
                                   ("storage", "buckets", ["id", "public"])):
        columns.extend({"table_schema": schema, "table_name": table, "column_name": name} for name in fields)
    snapshot = {"format_version": FORMAT, "source_project": "hltkduqytkgkglmevxvy",
                "server_version": "17.6", "captured_at": "synthetic",
                "public_data": {table: [] for table in TABLES},
                "auth_users": [{"id": "synthetic-uuid", "encrypted_password": "$2a$synthetic-not-a-password"}],
                "auth_identities": [{"id": "synthetic-identity"}],
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
