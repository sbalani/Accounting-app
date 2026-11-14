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
  members. Development agent may append new ordered additive application
  migrations, including routine application-table RLS/RPC grants, after
  exact-SHA synthetic migration tests and denial tests. Already-applied files
  remain immutable. Never run repo reset/seed commands on the destination.
- Development agent owns routine code, meaningful local tests, additive
  app-schema migration preparation and releases through the Accounting gateway.
  Before any release: inspect Git status/diff/history; run a dummy-config local
  build **or verify an app-scoped CI/Coolify build** for the exact commit,
  plus type/lint, relevant synthetic tests and production-dependency audit; scan
  staged files for secrets/data/artifacts; commit/push only the intended
  Accounting branch. Check `host status` and inspect the exact full commit SHA.
  `host test-migrate SHA` tests the immutable manifest on synthetic PostgreSQL.
  `host test-file SHA vps/tests/NAME.sql` executes committed, fixture/rollback
  native tests in that same **separate synthetic container**; the test-only role
  has fixture-table access and may `SET ROLE` anon/authenticated. Never infer
  those permissions for the production role.
  `host reset-test` resets ONLY that synthetic schema from production schema
  and migration metadata, copies no app/Auth/file rows and clears synthetic
  receipts. Run it only after the first live release and verification; then
  rerun `test-migrate SHA` and every `test-file SHA` for the deployed commit
  to check independent reset/retest without redeploying.
  The gateway's `migrate SHA` and `release SHA` validate immutable hashes, use
  a transaction/advisory lock and local rollback dump, and refresh PostgREST;
  `release SHA` migrates **before** Coolify deployment. Do not improvise direct
  production SQL or Docker/SSH/Coolify commands. Verify release status and
  health/authenticated disposable smoke tests before reporting success. On a
  busy dev VPS, do not repeatedly rerun a resource-limited build when the
  feature code already built with dummy settings; use the exact-SHA Coolify
  build as the release authority and keep the prior live app if that build fails.
- The one-time provisioning gate was cleared after the Accounting-only gateway
  and committed synthetic migration/native tests passed. For each routine
  approved additive app release, prepare the exact immutable commit, run
  `test-migrate SHA` and relevant committed `test-file SHA` tests, then use
  `release SHA` through the gateway and verify status, deployment logs and
  `verify-access` plus app health and authenticated disposable smoke checks.
  No separate standing operator hold applies to routine additive releases.
  Destructive/data-loss SQL, financial-data rewrites outside explicit user
  requests, framework Auth/Storage ownership or protected credentials, source
  systems, paid billing/provider work and unrelated infrastructure require
  operator/user review. Routine additive app-table SQL and RLS/RPC grants
  remain development-agent owned with exact-SHA synthetic and denial checks.
  A GitHub push alone is not a Coolify release while `auto_deploy` is
  false; do not enable any trigger that bypasses migration-before-deployment.
  Already-applied immutable production migrations must never be rewritten;
  `reset-test` may be used to revise only unshipped SQL on synthetic data.
