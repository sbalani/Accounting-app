-- Add transfer support to transactions

-- Add transfer fields to transactions table
alter table public.transactions
add column if not exists transaction_type text check (transaction_type in ('expense', 'income', 'transfer')) default 'expense',
add column if not exists transfer_from_id uuid references public.payment_methods(id) on delete restrict,
add column if not exists transfer_to_id uuid references public.payment_methods(id) on delete restrict;

-- Update existing transactions to set transaction_type based on amount
update public.transactions
set transaction_type = case
  when amount < 0 then 'expense'
  when amount > 0 then 'income'
  else 'expense'
end;

-- Create transfer_rules table for auto-detecting transfers based on description patterns
create table if not exists public.transfer_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  rule_type text not null check (rule_type in ('contains', 'starts_with', 'ends_with', 'exact_match')),
  match_value text not null,
  transfer_direction text not null check (transfer_direction in ('to', 'from')),
  target_payment_method_id uuid references public.payment_methods(id) on delete restrict,
  priority integer not null default 0, -- Higher priority rules are checked first
  is_active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete cascade not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes
create index if not exists idx_transfer_rules_workspace_id on public.transfer_rules(workspace_id);
create index if not exists idx_transfer_rules_active on public.transfer_rules(workspace_id, is_active, priority desc);
create index if not exists idx_transactions_transfer_from on public.transactions(transfer_from_id);
create index if not exists idx_transactions_transfer_to on public.transactions(transfer_to_id);
create index if not exists idx_transactions_transaction_type on public.transactions(workspace_id, transaction_type);

-- Create function to update updated_at timestamp
create or replace function public.handle_transfer_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- Create trigger for updated_at
create trigger update_transfer_rules_updated_at
  before update on public.transfer_rules
  for each row
  execute function public.handle_transfer_rules_updated_at();

-- Enable RLS
alter table public.transfer_rules enable row level security;

-- RLS Policies for transfer_rules
create policy "Users can view transfer rules in their workspaces"
  on public.transfer_rules
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members
      where workspace_id = transfer_rules.workspace_id
      and user_id = (select auth.uid())
    )
  );

create policy "Users can create transfer rules in their workspaces"
  on public.transfer_rules
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workspace_members
      where workspace_id = transfer_rules.workspace_id
      and user_id = (select auth.uid())
    )
  );

create policy "Users can update transfer rules in their workspaces"
  on public.transfer_rules
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members
      where workspace_id = transfer_rules.workspace_id
      and user_id = (select auth.uid())
    )
  );

create policy "Users can delete transfer rules in their workspaces"
  on public.transfer_rules
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members
      where workspace_id = transfer_rules.workspace_id
      and user_id = (select auth.uid())
    )
  );

-- Add comments
comment on column public.transactions.transaction_type is 'Type of transaction: expense, income, or transfer';
comment on column public.transactions.transfer_from_id is 'For transfer transactions: the account money is transferred from';
comment on column public.transactions.transfer_to_id is 'For transfer transactions: the account money is transferred to';


