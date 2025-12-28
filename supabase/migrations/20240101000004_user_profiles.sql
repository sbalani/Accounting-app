-- Create profiles table for additional user information
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade not null,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;

-- RLS Policies for profiles
create policy "Users can view their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Users can view profiles of users in their workspaces"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm1
      join public.workspace_members wm2 on wm2.workspace_id = wm1.workspace_id
      where wm1.user_id = (select auth.uid())
      and wm2.user_id = profiles.id
    )
  );

create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "Users can insert their own profile"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- Function to create profile on user signup
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

-- Trigger to create profile when a new user signs up
-- Note: This runs alongside the workspace creation trigger
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_profile();

-- Function to update updated_at timestamp
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

-- Trigger to update updated_at on profile updates
create trigger update_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.handle_updated_at();
