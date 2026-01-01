-- Add description column to subscriptions table
alter table public.subscriptions
  add column if not exists description text;

