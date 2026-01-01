-- Create merchants table (similar structure to transaction_categories)
create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete set null
);

-- Create indexes for merchants
create index if not exists idx_merchants_workspace_id on public.merchants(workspace_id);
create index if not exists idx_merchants_name on public.merchants(name);

-- Ensure existing categories have workspace_id = null if is_default = true
-- This makes them truly universal
update public.transaction_categories
set workspace_id = null
where is_default = true and workspace_id is not null;

-- Add category_id and merchant_id foreign keys to transactions table
alter table public.transactions
  add column if not exists category_id uuid references public.transaction_categories(id) on delete set null,
  add column if not exists merchant_id uuid references public.merchants(id) on delete set null;

-- Create indexes for the new foreign keys
create index if not exists idx_transactions_category_id on public.transactions(category_id);
create index if not exists idx_transactions_merchant_id on public.transactions(merchant_id);

-- Migrate existing category text values to category_id
-- Match by category name (case-insensitive)
update public.transactions t
set category_id = (
  select tc.id
  from public.transaction_categories tc
  where lower(trim(tc.name)) = lower(trim(t.category))
  and (tc.is_default = true or tc.workspace_id = t.workspace_id)
  order by tc.is_default desc, tc.created_at asc
  limit 1
)
where t.category is not null and t.category_id is null;

-- Migrate existing merchant text values to merchant_id
-- Create merchants on the fly for existing merchant values
do $$
declare
  tx_record record;
  merchant_uuid uuid;
begin
  for tx_record in 
    select distinct workspace_id, merchant
    from public.transactions
    where merchant is not null
    and merchant_id is null
    and merchant != ''
  loop
    -- Check if merchant already exists for this workspace or as universal
    select id into merchant_uuid
    from public.merchants
    where lower(trim(name)) = lower(trim(tx_record.merchant))
    and (
      (workspace_id = tx_record.workspace_id)
      or (is_default = true and workspace_id is null)
    )
    limit 1;

    -- If merchant doesn't exist, create it as workspace-specific
    if merchant_uuid is null then
      insert into public.merchants (workspace_id, name, is_default)
      values (tx_record.workspace_id, tx_record.merchant, false)
      returning id into merchant_uuid;
    end if;

    -- Update all transactions with this merchant text to use the merchant_id
    update public.transactions
    set merchant_id = merchant_uuid
    where workspace_id = tx_record.workspace_id
    and lower(trim(merchant)) = lower(trim(tx_record.merchant))
    and merchant_id is null;
  end loop;
end $$;

-- Enable RLS on merchants table
alter table public.merchants enable row level security;

-- RLS Policies for merchants (similar to transaction_categories)
create policy "Users can view default merchants and merchants in their workspaces"
  on public.merchants
  for select
  to authenticated
  using (
    is_default = true
    or workspace_id is null
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = merchants.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can create merchants in their workspaces"
  on public.merchants
  for insert
  to authenticated
  with check (
    workspace_id is null
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = merchants.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can update merchants in their workspaces"
  on public.merchants
  for update
  to authenticated
  using (
    workspace_id is null
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = merchants.workspace_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    workspace_id is null
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = merchants.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can delete merchants in their workspaces"
  on public.merchants
  for delete
  to authenticated
  using (
    (workspace_id is null or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = merchants.workspace_id
      and wm.user_id = auth.uid()
    ))
    and is_default = false
  );

