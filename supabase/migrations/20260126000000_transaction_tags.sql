-- Create transaction_tags table
create table if not exists public.transaction_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  color text, -- Optional color for UI display (hex color code)
  exclude_from_analytics boolean not null default false, -- If true, exclude transactions with this tag from main analytics
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_by uuid references auth.users(id) on delete cascade not null,
  unique(workspace_id, name) -- Ensure tag names are unique within a workspace
);

-- Create transaction_tag_assignments junction table (many-to-many relationship)
create table if not exists public.transaction_tag_assignments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid references public.transactions(id) on delete cascade not null,
  tag_id uuid references public.transaction_tags(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(transaction_id, tag_id) -- Prevent duplicate tag assignments
);

-- Create indexes for performance
create index if not exists idx_transaction_tags_workspace_id on public.transaction_tags(workspace_id);
create index if not exists idx_transaction_tags_name on public.transaction_tags(workspace_id, name);
create index if not exists idx_transaction_tag_assignments_transaction_id on public.transaction_tag_assignments(transaction_id);
create index if not exists idx_transaction_tag_assignments_tag_id on public.transaction_tag_assignments(tag_id);
create index if not exists idx_transaction_tag_assignments_composite on public.transaction_tag_assignments(transaction_id, tag_id);

-- Create function to update updated_at timestamp
create or replace function public.handle_transaction_tags_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- Create trigger for updated_at
create trigger update_transaction_tags_updated_at
  before update on public.transaction_tags
  for each row
  execute function public.handle_transaction_tags_updated_at();

-- Enable RLS on transaction_tags table
alter table public.transaction_tags enable row level security;

-- RLS Policies for transaction_tags
create policy "Users can view tags in their workspaces"
  on public.transaction_tags
  for select
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = transaction_tags.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can create tags in their workspaces"
  on public.transaction_tags
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = transaction_tags.workspace_id
      and wm.user_id = auth.uid()
    )
    and created_by = auth.uid()
  );

create policy "Users can update tags in their workspaces"
  on public.transaction_tags
  for update
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = transaction_tags.workspace_id
      and wm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = transaction_tags.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can delete tags in their workspaces"
  on public.transaction_tags
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = transaction_tags.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Enable RLS on transaction_tag_assignments table
alter table public.transaction_tag_assignments enable row level security;

-- RLS Policies for transaction_tag_assignments
create policy "Users can view tag assignments for transactions in their workspaces"
  on public.transaction_tag_assignments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.transactions t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = transaction_tag_assignments.transaction_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can create tag assignments for transactions in their workspaces"
  on public.transaction_tag_assignments
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.transactions t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = transaction_tag_assignments.transaction_id
      and wm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.transaction_tags tt
      join public.workspace_members wm on wm.workspace_id = tt.workspace_id
      where tt.id = transaction_tag_assignments.tag_id
      and wm.user_id = auth.uid()
    )
  );

create policy "Users can delete tag assignments for transactions in their workspaces"
  on public.transaction_tag_assignments
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.transactions t
      join public.workspace_members wm on wm.workspace_id = t.workspace_id
      where t.id = transaction_tag_assignments.transaction_id
      and wm.user_id = auth.uid()
    )
  );

-- Add comment for documentation
comment on table public.transaction_tags is 'Tags that can be assigned to transactions for organization and analytics';
comment on column public.transaction_tags.exclude_from_analytics is 'If true, transactions with this tag will be excluded from main analytics dashboard';
comment on table public.transaction_tag_assignments is 'Junction table linking transactions to tags (many-to-many relationship)';
