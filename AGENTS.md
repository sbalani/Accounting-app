# Accounting App agent ownership and release boundary

- Work on Accounting App code only in `/home/dev/projects/accounting-app`.
  Record non-secret progress at `/home/dev/projects/accounting-app-migration-status.txt`
  (outside Git). Never put credentials, private financial records, statements,
  exports, downloaded objects or private keys in the repo, status or logs.
- The original Supabase source is a preserved read-only reference. The new-host
  PostgreSQL/Auth/PostgREST/Storage installation is the Accounting destination.
  Do not touch other apps, old VPS infrastructure, source data, provider keys,
  or unrelated Coolify networks/volumes. Existing Auth UUID/password continuity,
  Storage keys and workspace RLS must remain intact. Never reset, seed, bulk
  recalculate balances or replay historical `supabase/migrations` files.
- The dedicated forced-command gateway is
  `/home/dev/projects/accounting-hosting-access/host` (outside Git). It uses only
  the Accounting key and the operator-pinned `known_hosts`; never bypass strict
  host-key verification or use a different host identity. `host help` and
  `host status` are safe first probes. `host sql` accepts read-only production
  SQL on stdin. `host test-sql` addresses a **separate synthetic container**.
  The production role owns the application `public` schema; Auth access is
  limited to IDs, emails and references, not hashes or service secrets. Don't
  request or log those secrets.
- Only reviewed **additive destination application** SQL goes in
  `vps/migration-manifest.json`, in dependency order. At this checkpoint its
  entire allowlist is the subscription columns migration and the Revolut
  first-import RPC migration. Source/historical migrations are NOT manifest
  members. Changing this list, any destructive/privilege SQL or data rewrite
  needs operator review. Never run repo reset/seed commands on the destination.
- Development agent owns routine code, meaningful local tests, additive
  app-schema migration preparation and releases through the Accounting gateway.
  Before any release: inspect Git status/diff/history; run dummy-config build,
  type/lint, relevant synthetic tests and production-dependency audit; scan
  staged files for secrets/data/artifacts; commit/push only the intended
  Accounting branch. Check `host status` and inspect the exact full commit SHA.
  `host test-migrate SHA` tests the immutable manifest on synthetic PostgreSQL.
  `host test-file SHA vps/tests/NAME.sql` executes committed, fixture/rollback
  native tests in that same **separate synthetic container**; the test-only role
  has fixture-table access and may `SET ROLE` anon/authenticated. Never infer
  those permissions for the production role.
  The gateway's `migrate SHA` and `release SHA` validate immutable hashes, use
  a transaction/advisory lock and local rollback dump, and refresh PostgREST;
  `release SHA` migrates **before** Coolify deployment. Do not improvise direct
  production SQL or Docker/SSH/Coolify commands. Verify release status and
  health/authenticated disposable smoke tests before reporting success.
- **One-time first-release gate:** prepare/commit the manifest, run gateway
  probes, `test-migrate` and the committed synthetic `test-file`, then report
  the exact full SHA and receipts for operator provisioning review. Do NOT
  invoke `migrate`, `release` or `deploy` until the operator clears this
  one-time gate. After clearance, subsequent routine approved additive app
  releases belong to the development agent under the workflow above; this is
  not a permanent hold. A GitHub push alone is not a Coolify release while
  `auto_deploy` is false.
