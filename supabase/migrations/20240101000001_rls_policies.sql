-- Enable Row Level Security on all tables
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.payment_methods enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_categories enable row level security;

-- Helper function to check if user is a member of a workspace
create or replace function public.is_workspace_member(workspace_id_param uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1
    from public.workspace_members
    where workspace_id = workspace_id_param
    and user_id = (select auth.uid())
  );
end;
$$;

-- Helper function to check if user is workspace owner
create or replace function public.is_workspace_owner(workspace_id_param uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  return exists (
    select 1
    from public.workspace_members
    where workspace_id = workspace_id_param
    and user_id = (select auth.uid())
    and role = 'owner'
  );
end;
$$;

-- Workspaces policies
create policy "Users can view workspaces they are members of"
  on public.workspaces
  for select
  to authenticated
  using (public.is_workspace_member(id));

create policy "Users can create workspaces"
  on public.workspaces
  for insert
  to authenticated
  with check ((select auth.uid()) = created_by);

create policy "Owners can update their workspaces"
  on public.workspaces
  for update
  to authenticated
  using (public.is_workspace_owner(id))
  with check (public.is_workspace_owner(id));

create policy "Owners can delete their workspaces"
  on public.workspaces
  for delete
  to authenticated
  using (public.is_workspace_owner(id));

-- Workspace members policies
create policy "Users can view workspace members of their workspaces"
  on public.workspace_members
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Owners can add workspace members"
  on public.workspace_members
  for insert
  to authenticated
  with check (public.is_workspace_owner(workspace_id));

create policy "Owners can update workspace members"
  on public.workspace_members
  for update
  to authenticated
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

create policy "Owners can remove workspace members"
  on public.workspace_members
  for delete
  to authenticated
  using (public.is_workspace_owner(workspace_id));

-- Workspace invitations policies
create policy "Users can view invitations for their workspaces"
  on public.workspace_invitations
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Owners can create workspace invitations"
  on public.workspace_invitations
  for insert
  to authenticated
  with check (public.is_workspace_owner(workspace_id));

create policy "Owners can update workspace invitations"
  on public.workspace_invitations
  for update
  to authenticated
  using (public.is_workspace_owner(workspace_id))
  with check (public.is_workspace_owner(workspace_id));

create policy "Owners can delete workspace invitations"
  on public.workspace_invitations
  for delete
  to authenticated
  using (public.is_workspace_owner(workspace_id));

-- Payment methods policies
create policy "Users can view payment methods in their workspaces"
  on public.payment_methods
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Users can create payment methods in their workspaces"
  on public.payment_methods
  for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (select auth.uid()) = created_by
  );

create policy "Users can update payment methods in their workspaces"
  on public.payment_methods
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "Users can delete payment methods in their workspaces"
  on public.payment_methods
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Transactions policies
create policy "Users can view transactions in their workspaces"
  on public.transactions
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "Users can create transactions in their workspaces"
  on public.transactions
  for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id)
    and (select auth.uid()) = created_by
  );

create policy "Users can update transactions in their workspaces"
  on public.transactions
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "Users can delete transactions in their workspaces"
  on public.transactions
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Transaction categories policies
create policy "Users can view default categories and categories in their workspaces"
  on public.transaction_categories
  for select
  to authenticated
  using (
    is_default = true
    or workspace_id is null
    or public.is_workspace_member(workspace_id)
  );

create policy "Users can create categories in their workspaces"
  on public.transaction_categories
  for insert
  to authenticated
  with check (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
  );

create policy "Users can update categories in their workspaces"
  on public.transaction_categories
  for update
  to authenticated
  using (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
  )
  with check (
    workspace_id is null
    or public.is_workspace_member(workspace_id)
  );

create policy "Users can delete categories in their workspaces"
  on public.transaction_categories
  for delete
  to authenticated
  using (
    (workspace_id is null or public.is_workspace_member(workspace_id))
    and is_default = false
  );
