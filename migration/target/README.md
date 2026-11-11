# Destination-only template (not a deployment)

Image tags and component configuration derive from official Supabase upstream
[`86f9c0c2506c8276a03410d99f3185b8bd67d0e9`](https://github.com/supabase/supabase/tree/86f9c0c2506c8276a03410d99f3185b8bd67d0e9/docker):
`docker/docker-compose.yml` and `docker/volumes/db/{roles,jwt}.sql`.
The source reports PostgreSQL **17.6** and GoTrue **v2.197.0**; the pinned
upstream images are `supabase/postgres:17.6.1.136`, `supabase/gotrue:v2.197.0`,
`postgrest/postgrest:v14.18`, `supabase/storage-api:v1.89.12`, and
`envoyproxy/envoy:v1.39.6`. Pin image **digests** before deployment after review.
PostgreSQL 15 repo-local config must **not** be used as source schema.

The backend DB/Auth/PostgREST/Storage share an internal network with no
published ports. Only the gateway also joins the separately provisioned
`accounting-app` external network, where Coolify's accounting proxy and
standalone Next.js app must be connected; no other app or control network
joins this backend. App-only GitHub redeploys leave core volumes unchanged.
An internal-only Auth service cannot send SMTP directly off-host: provision
an approved private SMTP relay reachable on the internal network before
enabling signup/recovery email. No core service is launched on the dev VPS.

`upstream/roles.sql` and `upstream/jwt.sql` are copied from that exact upstream
commit (only descriptive comments added). Review bootstrap role creation and
image digests before provisioning. Keep `secrets.env` only on the new
host root-only and provide POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY,
SERVICE_ROLE_KEY, POSTGRES_PASSWORD (for upstream roles.sql), SMTP settings
as applicable. No ports are published. Isolated named network must be attached
to a correctly configured Coolify reverse proxy for the two approved domains.

**Not ready to start:** validate bootstrapped roles/schema/extension migrations,
auth hash and user schema compatibility, CORS, login redirects, mailer, PostgREST
JWT behavior, Storage schema and object metadata, resource sizing and backup.
The minimal Envoy routes do not implement upstream API-key admission; add
reviewed gateway protections/rate limits before exposing externally. Schema-only
source export/review is a prerequisite for restore: JSON column metadata alone
cannot reconstruct indexes, FKs, defaults, RLS and all auth internals safely.
No containers/ports have been launched.
