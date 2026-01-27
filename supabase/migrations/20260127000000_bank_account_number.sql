-- Add optional bank account number to payment_methods for distinguishing accounts
alter table public.payment_methods
  add column if not exists bank_account_number text;

comment on column public.payment_methods.bank_account_number is 'Optional bank account number (or last 4 digits) to help distinguish between accounts.';
