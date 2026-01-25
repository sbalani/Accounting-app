-- Track the latest statement date imported per payment method
alter table public.payment_methods
  add column if not exists last_statement_imported_through date;

comment on column public.payment_methods.last_statement_imported_through is
  'Latest transaction date in the most recently imported statement for this payment method.';
