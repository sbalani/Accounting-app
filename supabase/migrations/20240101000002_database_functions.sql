-- Function to update payment method balance when transactions change
create or replace function public.update_payment_method_balance()
returns trigger
language plpgsql
security definer
as $$
declare
  payment_method_record record;
  calculated_balance numeric(15, 2);
begin
  -- Get the payment method
  select * into payment_method_record
  from public.payment_methods
  where id = coalesce(new.payment_method_id, old.payment_method_id);

  -- Calculate balance from initial balance + sum of all transactions
  select coalesce(pm.initial_balance, 0) + coalesce(sum(t.amount), 0)
  into calculated_balance
  from public.payment_methods pm
  left join public.transactions t on t.payment_method_id = pm.id
  where pm.id = payment_method_record.id
  group by pm.id, pm.initial_balance;

  -- Update the payment method balance
  update public.payment_methods
  set current_balance = coalesce(calculated_balance, initial_balance)
  where id = payment_method_record.id;

  return coalesce(new, old);
end;
$$;

-- Trigger to update balance on transaction insert/update/delete
create trigger update_payment_method_balance_trigger
  after insert or update or delete on public.transactions
  for each row
  execute function public.update_payment_method_balance();

-- Function to recalculate balance for a payment method (for reconciliation)
create or replace function public.recalculate_payment_method_balance(payment_method_id_param uuid)
returns numeric
language plpgsql
security definer
as $$
declare
  calculated_balance numeric(15, 2);
  payment_method_record record;
begin
  -- Get the payment method
  select * into payment_method_record
  from public.payment_methods
  where id = payment_method_id_param;

  if not found then
    raise exception 'Payment method not found';
  end if;

  -- Check if user has access to the workspace
  if not public.is_workspace_member(payment_method_record.workspace_id) then
    raise exception 'Access denied';
  end if;

  -- Calculate balance from initial balance + sum of all transactions
  select coalesce(pm.initial_balance, 0) + coalesce(sum(t.amount), 0)
  into calculated_balance
  from public.payment_methods pm
  left join public.transactions t on t.payment_method_id = pm.id
  where pm.id = payment_method_id_param
  group by pm.id, pm.initial_balance;

  -- Update the payment method balance
  update public.payment_methods
  set current_balance = coalesce(calculated_balance, initial_balance)
  where id = payment_method_id_param;

  return coalesce(calculated_balance, payment_method_record.initial_balance);
end;
$$;

-- Function to find potential duplicate transactions
-- Matches on: amount, transaction_date (±1 day), payment_method_id
create or replace function public.find_duplicate_transactions(
  workspace_id_param uuid,
  amount_param numeric,
  transaction_date_param date,
  payment_method_id_param uuid,
  exclude_transaction_id uuid default null
)
returns table (
  id uuid,
  amount numeric,
  transaction_date date,
  description text,
  payment_method_id uuid,
  payment_method_name text,
  similarity_score numeric
)
language plpgsql
security definer
as $$
begin
  -- Check if user has access to the workspace
  if not public.is_workspace_member(workspace_id_param) then
    raise exception 'Access denied';
  end if;

  return query
  select
    t.id,
    t.amount,
    t.transaction_date,
    t.description,
    t.payment_method_id,
    pm.name as payment_method_name,
    case
      -- Exact match: amount, date, payment method
      when abs(t.amount - amount_param) < 0.01
        and t.transaction_date = transaction_date_param
        and t.payment_method_id = payment_method_id_param
      then 100.0
      -- Close match: same amount and payment method, within 1 day
      when abs(t.amount - amount_param) < 0.01
        and t.payment_method_id = payment_method_id_param
        and abs(extract(epoch from (t.transaction_date - transaction_date_param))) < 86400
      then 90.0
      -- Similar amount (within 1%), same payment method, same date
      when abs((t.amount - amount_param) / nullif(amount_param, 0)) < 0.01
        and t.transaction_date = transaction_date_param
        and t.payment_method_id = payment_method_id_param
      then 85.0
      -- Similar amount, same payment method, within 1 day
      when abs((t.amount - amount_param) / nullif(amount_param, 0)) < 0.01
        and t.payment_method_id = payment_method_id_param
        and abs(extract(epoch from (t.transaction_date - transaction_date_param))) < 86400
      then 75.0
      else 0.0
    end as similarity_score
  from public.transactions t
  join public.payment_methods pm on pm.id = t.payment_method_id
  where t.workspace_id = workspace_id_param
    and t.duplicate_of is null
    and (exclude_transaction_id is null or t.id != exclude_transaction_id)
    and (
      -- Exact amount and date match
      (abs(t.amount - amount_param) < 0.01
        and t.transaction_date = transaction_date_param
        and t.payment_method_id = payment_method_id_param)
      -- Same amount, same payment method, within 1 day
      or (abs(t.amount - amount_param) < 0.01
        and t.payment_method_id = payment_method_id_param
        and abs(extract(epoch from (t.transaction_date - transaction_date_param))) < 86400)
      -- Similar amount (within 1%), same payment method, same date
      or (abs((t.amount - amount_param) / nullif(amount_param, 0)) < 0.01
        and t.transaction_date = transaction_date_param
        and t.payment_method_id = payment_method_id_param)
      -- Similar amount, same payment method, within 1 day
      or (abs((t.amount - amount_param) / nullif(amount_param, 0)) < 0.01
        and t.payment_method_id = payment_method_id_param
        and abs(extract(epoch from (t.transaction_date - transaction_date_param))) < 86400)
    )
  order by similarity_score desc, t.transaction_date desc
  limit 10;
end;
$$;

-- Function to create default workspace on user signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  new_workspace_id uuid;
begin
  -- Create a default workspace for the new user
  insert into public.workspaces (name, created_by)
  values ('My Workspace', new.id)
  returning id into new_workspace_id;

  -- Add the user as owner of their workspace
  insert into public.workspace_members (workspace_id, user_id, role, joined_at)
  values (new_workspace_id, new.id, 'owner', now());

  return new;
end;
$$;

-- Trigger to create default workspace when a new user signs up
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
