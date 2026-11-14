# Subscription follow-up for operator review (not applied)

The additive migration `supabase/migrations/20261114000000_subscription_matching_and_archiving.sql`
must be reviewed against the **destination** live schema, backed up, and run
explicitly before deploying the accompanying app changes. It has not been run
against either database. No balances, transaction IDs/links, existing names or
existing notes are rewritten. Existing subscriptions become `direct`/`monthly`
by default; their new statement text remains null until edited.

- **Display name** (`name`) is readable to people; **statement entry**
  (`statement_match_text`) stores the distinctive text on the account statement.
  The existing `description` remains optional notes. The editor and new form
  expose account, amount in workspace primary currency, due day, monthly/yearly
  schedule (month for yearly), provider, merchant, category, statement entry,
  name and notes.
- **Mark cancelled** sets `is_active=false` and excludes suggestions; **Remove**
  sets `archived_at` and hides the subscription without unlinking transaction
  history or touching payment balances. Neither action cancels external billing:
  Apple/merchant charges must be cancelled with that provider. Historical links
  remain in the database for audit; removal is reversible in the database, not
  a permanent purge from the UI.
- Existing matching suggests an active subscription from the **same payment
  account**, expected amount and scheduled billing date (within two calendar
  days). Direct billing additionally requires the saved statement text or a
  matching merchant. Apple matching requires a recognizable Apple statement
  entry; its amount is within one cent and it uses the configured billing
  interval/month. February/end-of-month billing is clamped to the last day.
  Multiple plausible Apple services are displayed for **manual selection**;
  nothing is auto-linked. A generic Apple charge without a configured match
  does not auto-create a service. Adding an Apple transaction manually prompts
  for the service display name; subscriptions can also be created from the
  subscriptions page before any charge appears.
- Linking a transaction explicitly still uses the existing transaction update
  path, which fires the existing balance trigger. The pre-existing
  cross-payment-account balance edge remains a separate user-authorized fix;
  this migration never recalculates balances in bulk.

Before rollout: verify schema/policies and a backup, apply this one additive
migration only to the approved destination, reload the PostgREST schema cache
if needed, then test edit/cancel/remove of linked and unlinked disposable
subscriptions and unique/ambiguous Apple charges under real authenticated
workspace access. No private financial data or credentials belong in git.
