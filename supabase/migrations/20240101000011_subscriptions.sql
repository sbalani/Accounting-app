-- Create subscriptions table
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  amount numeric(15, 2) not null,
  due_day integer not null check (due_day >= 1 and due_day <= 31),
  payment_method_id uuid references public.payment_methods(id) on delete restrict not null,
  merchant_id uuid references public.merchants(id) on delete set null,
  category_id uuid references public.transaction_categories(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete cascade not null
);

-- Create indexes for subscriptions
create index if not exists idx_subscriptions_workspace_id on public.subscriptions(workspace_id);
create index if not exists idx_subscriptions_payment_method_id on public.subscriptions(payment_method_id);
create index if not exists idx_subscriptions_merchant_id on public.subscriptions(merchant_id);
create index if not exists idx_subscriptions_category_id on public.subscriptions(category_id);
create index if not exists idx_subscriptions_is_active on public.subscriptions(workspace_id, is_active);

-- Add subscription_id to transactions table
alter table public.transactions
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;

-- Create index for subscription_id in transactions
create index if not exists idx_transactions_subscription_id on public.transactions(subscription_id);

-- Create function to update updated_at timestamp
create or replace function public.handle_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- Create trigger for updated_at
create trigger update_subscriptions_updated_at
  before update on public.subscriptions
  for each row
  execute function public.handle_subscriptions_updated_at();

-- Enable RLS on subscriptions table
alter table public.subscriptions enable row level security;

-- RLS Policies for subscriptions
create policy "Users can view subscriptions in their workspaces"
  on public.subscriptions
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = subscriptions.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can create subscriptions in their workspaces"
  on public.subscriptions
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = subscriptions.workspace_id
      and wm.user_id = auth.uid()
    )
    and created_by = auth.uid()
  );

create policy "Users can update subscriptions in their workspaces"
  on public.subscriptions
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = subscriptions.workspace_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = subscriptions.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can delete subscriptions in their workspaces"
  on public.subscriptions
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = subscriptions.workspace_id
      and wm.user_id = auth.uid()
    )
  );

