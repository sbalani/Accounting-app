import hashlib
import copy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from restore_snapshot import (TABLES, FORMAT, REVIEWED_OBJECT_ORDINALS, REVIEWED_ICEBERG_COLUMNS,
                              validate, validate_files, render_sql, insert_statement, generated_check, sql_tokens)
from import_objects import render_storage_metadata_sql, validate_storage_metadata, request


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


def reviewed_sample():
    snapshot, destination = sample()
    for name, (before, _) in REVIEWED_OBJECT_ORDINALS.items():
        snapshot["columns"].append({"table_schema": "storage", "table_name": "objects", "column_name": name,
                                    "ordinal_position": before, "dtd_identifier": str(before), "data_type": "synthetic",
                                    "is_generated": "NEVER", "is_identity": "NO", "identity_generation": None})
    for i in range(59):
        snapshot["policies"].append({"schemaname": "public" if i < 51 else "storage", "tablename": "synthetic",
                                     "policyname": f"policy_{i}", "qual": "owner_id = 'a b'",
                                     "with_check": "auth.uid() = owner", "roles": ["authenticated"], "cmd": "ALL"})
    destination["columns"] = copy.deepcopy(snapshot["columns"])
    destination["policies"] = copy.deepcopy(snapshot["policies"])
    for column in destination["columns"]:
        if column["table_schema"] == "storage" and column["table_name"] == "objects":
            column["ordinal_position"] -= 1
            column["dtd_identifier"] = str(column["ordinal_position"])
    for table, names in REVIEWED_ICEBERG_COLUMNS.items():
        for name in sorted(names):
            destination["columns"].append({"table_schema": "storage", "table_name": table, "column_name": name,
                                           "data_type": "synthetic", "is_generated": "NEVER", "is_identity": "NO",
                                           "identity_generation": None})
    destination["policies"][0]["qual"] = "owner_id='a b'"
    return snapshot, destination


class RestoreTests(unittest.TestCase):
    def test_storage_metadata_preserved_only_after_readback_and_never_replaces_service_ids(self):
        snapshot, _ = sample()
        for name in ("id", "bucket_id", "name", "metadata", "owner", "owner_id", "created_at",
                     "updated_at", "last_accessed_at", "user_metadata", "version", "version_id"):
            snapshot["columns"].append({"table_schema": "storage", "table_name": "objects", "column_name": name,
                                        "is_generated": "NEVER", "is_identity": "NO", "identity_generation": None})
        snapshot["storage_objects"][0].update({
            "id": "source-object-id-not-to-copy", "bucket_id": "receipts",
            "name": "synthetic-uuid/w/receipt/synthetic.jpg", "owner": "synthetic-uuid",
            "owner_id": "synthetic-uuid", "metadata": {"mimetype": "image/jpeg", "cacheControl": "max-age=3600",
                                                   "eTag": "source-etag-not-to-copy", "size": 9},
            "created_at": "2024-01-01T00:00:00Z", "updated_at": "2024-01-02T00:00:00Z",
            "last_accessed_at": None, "user_metadata": {"synthetic": True},
            "version": "source-version-not-to-copy", "version_id": "source-version-id-not-to-copy",
        })
        snapshot["triggers"] = [
            {"schema": "storage", "table": "objects", "definition":
             "CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column()"},
            {"schema": "storage", "table": "objects", "definition":
             "CREATE TRIGGER protect_objects_delete BEFORE DELETE ON storage.objects FOR EACH STATEMENT EXECUTE FUNCTION storage.protect_delete()"},
        ]
        with patch("import_objects.EXPECTED_OBJECT_COUNT", 1):
            validate_storage_metadata(snapshot)
            sql = render_storage_metadata_sql(snapshot)
        self.assertIn("unexpected destination object count", sql)
        self.assertIn("destination object key, MIME or cache-control mismatch", sql)
        self.assertIn("destination private bucket metadata mismatch", sql)
        self.assertIn("destination storage metadata verification failed", sql)
        self.assertIn("service-generated storage fields changed", sql)
        self.assertIn("unexpected destination update trigger", sql)
        self.assertIn("delete protection trigger missing or changed", sql)
        self.assertIn("tr.tgtype = 19", sql)
        self.assertIn("tr.tgtype = 10", sql)
        self.assertNotIn("tr.tgtype = 11", sql)
        snapshot["triggers"][1]["definition"] = snapshot["triggers"][1]["definition"].replace(
            "FOR EACH STATEMENT", "FOR EACH ROW")
        with patch("import_objects.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "unreviewed source delete protection definition"):
                validate_storage_metadata(snapshot)
        snapshot["triggers"][1]["definition"] = snapshot["triggers"][1]["definition"].replace(
            "FOR EACH ROW", "FOR EACH STATEMENT")
        self.assertLess(sql.index("DISABLE TRIGGER update_objects_updated_at"), sql.index("UPDATE storage.objects"))
        self.assertLess(sql.index("UPDATE storage.objects"), sql.index("ENABLE TRIGGER update_objects_updated_at"))
        self.assertNotIn("DISABLE TRIGGER protect_objects_delete", sql)
        self.assertLess(sql.index("CREATE TEMP TABLE migration_storage_service_before"),
                        sql.index("UPDATE storage.objects"))
        self.assertLess(sql.index("destination object key, MIME or cache-control mismatch"), sql.index("UPDATE storage.objects"))
        self.assertIn("t.metadata->>'cacheControl'", sql)
        self.assertLess(sql.index("destination storage metadata verification failed"), sql.index("COMMIT;"))
        assignments = sql.split("UPDATE storage.objects AS t SET ", 1)[1].split(" FROM ", 1)[0]
        for field in ("owner", "owner_id", "created_at", "updated_at", "last_accessed_at", "user_metadata"):
            self.assertIn(f'"{field}" = e."{field}"', assignments)
        for field in ("id", "version", "version_id", "metadata"):
            self.assertNotIn(f'"{field}" =', assignments)
        snapshot["storage_objects"][0]["owner_id"] = "different-user"
        with patch("import_objects.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "ownership mismatch"):
                validate_storage_metadata(snapshot)
        snapshot["storage_objects"][0]["owner_id"] = "synthetic-uuid"
        snapshot["storage_objects"][0]["metadata"]["cacheControl"] = "max-age=120"
        with patch("import_objects.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "cache-control"):
                validate_storage_metadata(snapshot)

    def test_upload_sends_source_cache_control_and_does_not_follow_redirects(self):
        from unittest.mock import MagicMock
        from import_objects import NoRedirects
        fake_response = MagicMock()
        fake_response.__enter__.return_value = fake_response
        fake_response.read.return_value = b"synthetic"
        fake_response.headers = {"Cache-Control": "max-age=3600"}
        opener = MagicMock()
        opener.open.return_value = fake_response
        with patch("import_objects.urllib.request.build_opener", return_value=opener) as factory:
            body, headers = request("http://gateway:8000/storage/v1/object/receipts/synthetic",
                                    "synthetic-key", "POST", b"synthetic", "image/jpeg", "max-age=3600")
        self.assertEqual(body, b"synthetic")
        self.assertEqual(headers["Cache-Control"], "max-age=3600")
        upload = opener.open.call_args.args[0]
        self.assertEqual(upload.get_header("Cache-control"), "max-age=3600")
        self.assertIs(factory.call_args.args[0], NoRedirects)

    def test_only_reviewed_storage_and_policy_whitespace_requires_opt_in(self):
        snapshot, destination = reviewed_sample()
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            with self.assertRaisesRegex(ValueError, "columns schema mismatch"):
                validate(snapshot, destination)
            report = validate(snapshot, destination, reviewed_storage_compatibility=True)
        self.assertEqual(len(report), 22)  # 3 physical + 18 additive + 1 policy expression
        self.assertTrue(any("storage.objects.archived_at" in entry for entry in report))
        self.assertTrue(any("policy public.synthetic.policy_0.qual" in entry for entry in report))
        self.assertEqual(snapshot["columns"][0]["column_name"], "id")  # raw inventory retained

    def test_policy_tokens_preserve_literal_identifier_and_comment_whitespace(self):
        self.assertEqual(sql_tokens('owner_id  =  E\'a  b\' AND "quoted name" = $x$a b$x$'),
                         sql_tokens('owner_id=E\'a  b\'  AND "quoted name"=$x$a b$x$'))
        self.assertNotEqual(sql_tokens("x='a b'"), sql_tokens("x = 'a  b'"))
        self.assertNotEqual(sql_tokens("x=1 /* a b */"), sql_tokens("x=1 /* a  b */"))
        with self.assertRaisesRegex(ValueError, "unclosed"):
            sql_tokens("x = 'unterminated")

    def test_reviewed_mode_rejects_policy_type_and_used_table_drift(self):
        snapshot, destination = reviewed_sample()
        with patch("restore_snapshot.EXPECTED_OBJECT_COUNT", 1):
            destination["policies"][0]["qual"] = "owner_id = 'a  b'"
            with self.assertRaisesRegex(ValueError, "policy expression"):
                validate(snapshot, destination, True)
            destination["policies"][0]["qual"] = "owner_id='a b'"
            destination["columns"][0]["data_type"] = "changed"
            with self.assertRaisesRegex(ValueError, "unreviewed column change"):
                validate(snapshot, destination, True)
            destination["columns"][0].pop("data_type")
            destination["columns"].append({"table_schema": "public", "table_name": "workspaces",
                                           "column_name": "unreviewed", "is_generated": "NEVER",
                                           "is_identity": "NO", "identity_generation": None})
            with self.assertRaisesRegex(ValueError, "unreviewed column addition"):
                validate(snapshot, destination, True)

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
