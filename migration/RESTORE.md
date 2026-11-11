# Root-only isolated destination runbook (review before execution)

The operator has an `accounting-migration-snapshot-v1` JSON snapshot and a
checksum-verified archive on the **new** host under
`/opt/accounting-migration/imports/initial`. There are 86 receipts and 21
statements (107 objects; 160093651 bytes, largest 2960936 bytes). Snapshot
reports 0 transactions, intentionally. The archived SHA256 is
`0a8d1c0ce9b32943fe570edc2eeeea041861b7f9bd7e24051ae95d9db440dfba`.
No source credentials, private snapshots or files belong in this repo/dev VPS.

1. Prepare a **separate** reviewed PostgreSQL 17.6 schema-only bootstrap from
   the live source definitions, including auth/storage managed schemas, all
   public defaults/functions/policies/grants/indexes/triggers and extensions.
   Do not execute repo historical migrations or seeds against populated data.
   Start core only after the operator reviews compose, proxy isolation, persistent
   volumes, JWTs, Auth mail handling, image digest pins and backups. Keep app
   deployments independent; there is no `up`/DDL command in this repo.
2. After core bootstrap and **before data**, capture destination schema
   metadata using the same SQL projection that created the source snapshot's
   `columns, constraints, functions, triggers, indexes, policies, grants, rls`
   arrays. Save it as a private JSON object with these arrays plus
   `server_version` from `SHOW server_version` and `auth_version` from a
   destination `/auth/v1/health` response. Required values: 17.6 and
   v2.197.0. The preflight compares all entries exactly; if any difference,
   stop and review, do not delete fields or bypass the check. PG 15 repo-local
   config is not suitable. Audit current source schemas again if the snapshot
   metadata has incomplete managed-schema columns. In particular, every
   `columns` entry must contain the information_schema `is_generated`,
   `is_identity` and `identity_generation` fields (including NULL for
   non-identity columns), identically on both sides.
3. Validate privately: `python3 migration/restore_snapshot.py SNAPSHOT_JSON
   DEST_SCHEMA_JSON MANIFEST_JSON EXTRACTED_FILES_ROOT`. This checks 13 public
   table sets/columns, auth hashes/identities, private buckets, schema equality,
   107 expected object paths, bytes and SHA256. It rejects nonzero transactions
   until an explicit balance-trigger import plan is approved. Source has only
   one email/password user and one identity. **Do not import** old-domain
   sessions (14), refresh tokens (54), MFA AMR claims (14), flow state (2) or
   any transient Auth state. Force new-domain login with the preserved hash/UUID;
   no password reset is planned.
4. Only on the new host, as root, in a mode-0700 directory under
   `/opt/accounting-migration/imports/initial`, pass `--sql-output` with an
   **unused absolute path** to generate mode-0600 private SQL. Inspect it
   offline. The script does not connect to a database. SQL runs a single
   serializable transaction, requires empty auth/public/storage tables, disables
   auth.users USER triggers during user import only (preventing duplicated
   workspaces/profiles), restores UUIDs/password hashes and 13 public tables in
   FK order, re-enables triggers before COMMIT and verifies row counts. It does
   not update/recalculate balances or import storage.objects metadata directly.
   GENERATED ALWAYS and identity-always fields are omitted from INSERT column
   lists using the independently matched column metadata. Source values,
   including auth.users.confirmed_at and auth.identities.email, remain in
   private JSON and are compared with typed destination computed values inside
   the same transaction before COMMIT; any mismatch rolls back. A generated
   row ID or absent generation flags fail closed rather than remapping IDs.
   Review exact source/destination SQL schema, row JSON shape and balances first.
   Then and only then explicitly run on **isolated destination** with
   `psql -X -v ON_ERROR_STOP=1 -f PRIVATE_SQL` using a private destination-only
   connection. No command in this runbook connects to the source.
5. After database commit, provision/import Storage bytes through the destination
   service (not a raw copy into its internal file backend). The opt-in
   `python3 migration/import_objects.py SNAPSHOT_JSON MANIFEST_JSON
   EXTRACTED_FILES_ROOT --isolated-destination` uses an internal-only
   `http://gateway:8000` URL and destination-only `DESTINATION_SERVICE_ROLE_KEY`
   from private environment; it hashes the original files before import and
   downloads and SHA256-checks every uploaded object. Uploads use no upsert.
   A failure can leave partial destination objects: stop and investigate the
   isolated copy before retry; never auto-delete/recreate the source or target.
   Storage metadata IDs are service-created; bucket names/keys/object bytes
   remain exact. Compare MIME and private bucket metadata after import.
6. Compare private source/destination read-only manifests using `reconcile.py`,
   confirm 13 table counts per workspace/currency, role membership, NUMERIC
   balances, FK validation, and all 107 object hashes/bytes. Authenticated
   smoke test with existing user plus a **destination-only** test user proves
   login/hash continuity, workspace RLS read/write denial, private Storage
   denial, owner/member behavior and reviewed atomic invitation RPC (from
   `destination-invitation-rpc.sql`, only on destination after review). Build
   the app image with actual public API/app build args only after these checks.

Migration scripts and templates are preflight tooling, not an executed restore.
