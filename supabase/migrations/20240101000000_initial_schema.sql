-- Create workspaces table
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete cascade not null
);

-- Create workspace_members table
create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('owner', 'member')),
  invited_at timestamp with time zone default timezone('utc'::text, now()),
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(workspace_id, user_id)
);

-- Create workspace_invitations table
create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  email text not null,
  invited_by uuid references auth.users(id) on delete cascade not null,
  token text not null unique,
  expires_at timestamp with time zone not null,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create payment_methods table
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('cash', 'bank_account', 'credit_card')),
  current_balance numeric(15, 2) not null default 0,
  initial_balance numeric(15, 2) not null default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete cascade not null
);

-- Create transactions table
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  payment_method_id uuid references public.payment_methods(id) on delete restrict not null,
  amount numeric(15, 2) not null,
  description text,
  category text,
  transaction_date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete cascade not null,
  source text not null check (source in ('manual', 'voice', 'receipt', 'csv', 'pdf')),
  duplicate_of uuid references public.transactions(id) on delete set null
);

-- Create transaction_categories table
create table public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  name text not null,
  color text,
  is_default boolean not null default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for performance
create index idx_workspace_members_workspace_id on public.workspace_members(workspace_id);
create index idx_workspace_members_user_id on public.workspace_members(user_id);
create index idx_workspace_invitations_token on public.workspace_invitations(token);
create index idx_workspace_invitations_workspace_id on public.workspace_invitations(workspace_id);
create index idx_payment_methods_workspace_id on public.payment_methods(workspace_id);
create index idx_transactions_workspace_id on public.transactions(workspace_id);
create index idx_transactions_payment_method_id on public.transactions(payment_method_id);
create index idx_transactions_transaction_date on public.transactions(transaction_date);
create index idx_transactions_workspace_date on public.transactions(workspace_id, transaction_date);
create index idx_transaction_categories_workspace_id on public.transaction_categories(workspace_id);

-- Insert default transaction categories
insert into public.transaction_categories (name, color, is_default) values
  ('Food & Dining', '#FF6B6B', true),
  ('Transportation', '#4ECDC4', true),
  ('Bills & Utilities', '#45B7D1', true),
  ('Shopping', '#FFA07A', true),
  ('Entertainment', '#98D8C8', true),
  ('Healthcare', '#F7DC6F', true),
  ('Education', '#BB8FCE', true),
  ('Travel', '#85C1E2', true),
  ('Personal Care', '#F8B739', true),
  ('Income', '#52BE80', true),
  ('Other', '#95A5A6', true);
