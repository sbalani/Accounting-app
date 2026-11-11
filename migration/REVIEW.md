# Data-preserving migration review (preflight only)

This branch prepares an application image and offline comparison tools. It does not
connect to, change, or provision either database. The operator has completed
the source restoration and moved a root-only snapshot and 107 verified objects
to the new host. Repository migrations are **not** evidence of its exact schema.

## Dependency inventory

- Next.js 14 App Router uses `@supabase/ssr` cookie clients in the browser,
  server components, routes, and middleware. Auth calls: password login, signup,
  code-to-session exchange, signout, and `getUser`. Public schema queries via
  PostgREST target workspaces, workspace_members, workspace_invitations,
  payment_methods, transactions, transaction_categories, profiles, merchants,
  categorization_rules, transfer_rules, subscriptions, transaction_tags, and
  transaction_tag_assignments. RPC: `find_duplicate_transactions` (other
  functions/triggers are database-side). No client Realtime channel/subscription,
  Edge Function invocation, or service-role client was found. Local config enables
  Realtime, but the application does not call it.
- Private Storage buckets `receipts` and `statements`; keys have the form
  `{uploader_uuid}/{workspace_uuid}/{receipt|statement|audio}/{timestamp}.{ext}`.
  HEIC JPEG companion keys end in `.preview.jpg`. Uploads return bucket-prefixed
  and bare paths; statements may be fetched through signed URLs. Keep both buckets,
  object bytes, keys, MIME metadata and private access; do not infer objects from
  transaction rows alone (files may be orphaned; audio uses `receipts`).
- Initial migrations define 13 public tables, two private buckets, workspace
  member/owner RLS and Storage policies. Auth user insertion triggers create a
  workspace and profile. Transaction trigger recalculates `current_balance` from
  `initial_balance + SUM(transactions.amount)`; updated_at triggers cover profiles,
  transfer rules, categorization rules, subscriptions and tags. Preserve these
  functions and triggers and test actual installed definitions. The transaction
  balance trigger uses the new payment method on update; movement between payment
  methods may leave the old account stale. Detect drift rather than rewriting data.
- Monetary columns: `numeric(15,2)` for balances, transaction amount/base_amount;
  `numeric(15,6)` exchange_rate. Keep exact SQL decimal types, transaction UUIDs,
  transaction_date DATE, TIMESTAMPTZ values and currency codes. Preserve both
  legacy text and foreign-key category/merchant fields, transfer links, tags,
  subscription references, statement import dates and workspace role membership.
- `xlsx` 0.18.5 parses untrusted uploaded statements. Next.js, React, Supabase
  clients, heic-convert and Recharts are locked in package-lock.json. Review live
  advisories with approved network access later; offline audit is not authoritative.

## Lowest-change target proposal (decision pending)

Deploy the standalone Next.js container plus **isolated** PostgreSQL (matching
source major and extensions), GoTrue Auth, PostgREST and Supabase-compatible
Storage with private persistent object storage, behind Coolify routing on the new
KVM4. Provide required JWT signing/config, auth email delivery and appropriate
service-to-service roles. Skip Studio, Analytics, Realtime and Edge Functions unless
live inspection finds actual use. This retains RLS via authenticated PostgREST and
preserves UUIDs and existing password hashes if the auth schema/hash format can be
restored compatibly. Do not assume copying JWT secrets or sessions: plan for
re-login, preserve existing encrypted password digests and UUID references,
confirm hash compatibility with **two test accounts** (or obtain explicit password
reset plan if impossible). Review Auth provider identities, MFA, email confirmations,
redirect URLs, mail settings, refresh tokens, and installed Auth version first.

An ordinary PostgreSQL-only backend is **not** a drop-in substitute: it would
require replacing browser and server Supabase clients, Auth/session lifecycle,
PostgREST filtering/joins/RPC and signed Storage URLs, and reproducing RLS with
per-request identity. It increases authorization and password-continuity risk and
is not the smallest change for this release.

**Sizing assumption (not a measured capacity):** reserve ~1-2 GiB for the app,
~1-2 GiB for PostgreSQL, ~0.5-1 GiB combined for Auth/PostgREST/Storage/proxy,
plus ~1 GiB transient build/backup headroom: budget at least 4-6 GiB RAM and
~2 vCPU runtime; build images off-host or provision extra headroom. Disk: measured
database size + object bytes + WAL + at least two independent backups and restore
headroom (initial planning minimum 3x combined DB/object size, plus OS/images).
Confirm capacity on **new** host only after measuring source; do not install the
full production stack on the dev VPS.

## Proposed gated export/restore and verification (not executed)

1. With authorized read-only source access, collect
   live table/column/FK/index/trigger/function/RLS/policy/extension definitions,
   Auth schema/version/user count/provider types, Storage metadata and bucket
   settings, sizes, object counts/bytes, and required password-hash compatibility.
   Compare live definitions with repo migrations; never run historical migrations
   or seed/default-category inserts against populated production.
2. Capture a consistent read-only logical snapshot including auth, public and
   storage metadata, all UUIDs, timestamps, DECIMAL values and roles; export **all**
   bucket objects by their existing exact keys, including orphaned objects and
   preview variants. Use read-only source credentials, restricted private files
   (mode 0600, private directory 0700), encrypted transport and backups. Coordinate
   a short write freeze for final delta/snapshot before cutover; otherwise snapshots
   of DB and object store can disagree. No credentials/exports in git or logs.
3. Restore to a newly isolated destination. Adapt bootstrap/schema to the **live**
   source, import Auth users before dependent rows with controlled handling of
   signup triggers (do not generate replacement workspaces/profiles), then rows
   and objects. Preserve constraints/RLS/SQL functions and validate triggers before
   writes. Do not let a transaction trigger recompute balances during bulk import
   without a deliberate restore plan: compare stored balances and calculated
   balances first; never silently correct production balances.
4. For each side independently, run `psql -X -q -A -t -v ON_ERROR_STOP=1 -f
   migration/read-only-manifest.sql` and redirect stdout only to a private file.
   The query runs in a repeatable-read READ ONLY transaction and emits a JSON
   object. It covers every public table, auth.users, Storage objects, per-workspace
   counts, per-workspace/currency amount/base_amount SUMs, account balances and
   FK validation/cross-workspace anomalies. Confirm snapshots were captured at the
   same write-freeze point. Extra FK checks (orphaned parent links) require a
   constraint-validated restore and separate live-schema review. For the strongest
   transaction-ID/timestamp proof, compare private canonical row exports (or
   sorted per-table ID/row checksums) from the same snapshot; aggregate totals
   alone cannot prove exact row identity.
5. Export/download bucket contents to two separate private roots containing
   `receipts/` and `statements/` subdirectories. Run `python3
   migration/reconcile.py SOURCE_JSON DEST_JSON SOURCE_ROOT DEST_ROOT` locally.
   It fails on DB manifest differences, nonzero cross-workspace/FK anomalies,
   metadata-vs-file object-count discrepancies, and object path/size/SHA256
   differences. It never prints private paths/values. Independently verify
   Storage metadata (MIME, access mode) and signed-URL expiry with two users.
6. In the isolated environment, log in with the preserved existing user and a
   second **destination-only test user** (source has only one user). Verify
   each can read their own workspace and shared roles, cannot list/read/write the
   other user's workspace data or download the other user's private receipts and
   statements, and that non-owners cannot mutate membership. Test signup/login,
   invitation acceptance, duplicate RPC, signed URLs, receipt preview, transaction
   insert/update/delete and exact per-currency balances using disposable test data
   only. Review existing invitation RLS: acceptance by a nonmember appears blocked
   by member-only SELECT/INSERT policies; resolve in the isolated environment.
7. Only after reconciliation and review, plan cutover and rollback. Keep old
   production untouched and recoverable until new-host signoff. No auto-seed,
   reset or DDL on the source.

## Packaging notes

Build with public `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`NEXT_PUBLIC_APP_URL` build args for the chosen host; they are embedded in browser
assets. Pass the matching runtime values in Coolify. Never put database passwords,
JWT signing keys or service-role keys in build args. `GET /api/health` is liveness
only; `GET /api/ready` probes Auth with a 3s deadline and returns only 200/503.
Both bypass the Supabase refresh middleware. Perform a separate authenticated
PostgREST/Storage smoke test before traffic; Auth readiness alone is not sufficient.
