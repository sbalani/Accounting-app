-- Add merchant/vendor field to transactions table
alter table public.transactions
  add column if not exists merchant text;

-- Create categorization_rules table for user-defined categorization rules
create table if not exists public.categorization_rules (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  rule_type text not null check (rule_type in ('exact_match', 'contains', 'ai_context')),
  match_field text not null check (match_field in ('description', 'merchant')),
  match_value text not null,
  category text not null,
  -- For AI context rules, store JSON with context instructions
  ai_context jsonb,
  priority integer not null default 0, -- Higher priority rules are checked first
  is_active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete cascade not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes
create index if not exists idx_categorization_rules_workspace_id on public.categorization_rules(workspace_id);
create index if not exists idx_categorization_rules_active on public.categorization_rules(workspace_id, is_active, priority desc);
create index if not exists idx_transactions_merchant on public.transactions(workspace_id, merchant);

-- Create function to update updated_at timestamp
create or replace function public.handle_categorization_rules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- Create trigger for updated_at
create trigger update_categorization_rules_updated_at
  before update on public.categorization_rules
  for each row
  execute function public.handle_categorization_rules_updated_at();

-- Enable RLS
alter table public.categorization_rules enable row level security;

-- RLS Policies for categorization_rules
create policy "Users can view categorization rules in their workspaces"
  on public.categorization_rules
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = categorization_rules.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can insert categorization rules in their workspaces"
  on public.categorization_rules
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = categorization_rules.workspace_id
      and wm.user_id = auth.uid()
    )
    and created_by = auth.uid()
  );

create policy "Users can update categorization rules in their workspaces"
  on public.categorization_rules
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = categorization_rules.workspace_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = categorization_rules.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can delete categorization rules in their workspaces"
  on public.categorization_rules
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = categorization_rules.workspace_id
      and wm.user_id = auth.uid()
    )
  );

