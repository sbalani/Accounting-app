-- Destination-only additive change for reviewed deployment. Apply explicitly after
-- backing up and reviewing the live schema; do not replay historical seed/reset.
-- Existing display names, notes, links and financial records are not rewritten.
alter table public.subscriptions
  add column statement_match_text text,
  add column billing_provider text not null default 'direct'
    check (billing_provider in ('direct', 'apple')),
  add column billing_interval text not null default 'monthly'
    check (billing_interval in ('monthly', 'yearly')),
  add column billing_month integer
    check (billing_month between 1 and 12),
  add column archived_at timestamptz,
  add constraint subscriptions_billing_month_check
    check ((billing_interval = 'monthly' and billing_month is null) or
           (billing_interval = 'yearly' and billing_month is not null));

comment on column public.subscriptions.statement_match_text is
  'Optional statement descriptor for suggestions; display name is stored separately in name.';
comment on column public.subscriptions.billing_provider is
  'Apple billing is suggested using account, amount and scheduled date; never auto-linked.';
comment on column public.subscriptions.archived_at is
  'Soft removal retains historical transaction links and avoids balance-trigger updates.';
