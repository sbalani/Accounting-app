-- Add currency support to workspaces, payment_methods, and transactions

-- Add primary_currency to workspaces (default to USD)
alter table public.workspaces
add column if not exists primary_currency text not null default 'USD';

-- Add currency to payment_methods (default to workspace primary_currency)
alter table public.payment_methods
add column if not exists currency text;

-- Update existing payment_methods to use workspace primary_currency
update public.payment_methods pm
set currency = (
  select w.primary_currency
  from public.workspaces w
  where w.id = pm.workspace_id
  limit 1
)
where currency is null;

-- Make currency not null after setting defaults
alter table public.payment_methods
alter column currency set not null,
alter column currency set default 'USD';

-- Add currency and exchange_rate to transactions
alter table public.transactions
add column if not exists currency text,
add column if not exists exchange_rate numeric(15, 6),
add column if not exists base_amount numeric(15, 2); -- Original amount in transaction currency

-- Update existing transactions to use payment method currency and set exchange_rate to 1
update public.transactions t
set 
  currency = (
    select pm.currency
    from public.payment_methods pm
    where pm.id = t.payment_method_id
    limit 1
  ),
  exchange_rate = 1,
  base_amount = t.amount
where currency is null;

-- Make currency not null after setting defaults
alter table public.transactions
alter column currency set not null,
alter column currency set default 'USD';

-- Add comment for documentation
comment on column public.workspaces.primary_currency is 'Primary currency for the workspace. All amounts are displayed in this currency.';
comment on column public.payment_methods.currency is 'Default currency for transactions in this payment method/account.';
comment on column public.transactions.currency is 'Currency of the transaction.';
comment on column public.transactions.exchange_rate is 'Exchange rate from transaction currency to workspace primary currency at transaction date. Can be manually overridden.';
comment on column public.transactions.base_amount is 'Original transaction amount in the transaction currency before conversion.';

