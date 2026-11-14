-- Destination-only, opt-in atomic import. Review live schema and back up first.
-- Do not replay old migrations, seed, or run against the source database.
create function public.import_revolut_initial_statement(
  p_workspace_id uuid,
  p_payment_method_id uuid,
  p_currency text,
  p_opening_balance numeric,
  p_expected_closing numeric,
  p_last_date date,
  p_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.payment_methods%rowtype;
  workspace_currency text;
  movement_count integer;
  movement_sum numeric(15, 2);
  latest_date date;
  actual_balance numeric(15, 2);
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Lock the account to prevent an overlapping first import. FK inserts into
  -- transactions take a conflicting key-share lock on the same account row.
  select * into account from public.payment_methods
  where id = p_payment_method_id and workspace_id = p_workspace_id
  for update;
  if not found or account.type <> 'bank_account' or account.currency <> p_currency or
     account.initial_balance <> 0 or account.current_balance <> 0 or
     account.last_statement_imported_through is not null then
    raise exception 'Account is not eligible for an initial statement import';
  end if;
  if exists (select 1 from public.transactions where payment_method_id = p_payment_method_id) then
    raise exception 'Account already has transaction history';
  end if;
  select primary_currency into workspace_currency from public.workspaces where id = p_workspace_id;
  if workspace_currency is null or workspace_currency <> p_currency then
    raise exception 'Statement and workspace currencies must match';
  end if;
  if p_opening_balance is null or p_expected_closing is null or
     round(p_opening_balance, 2) <> p_opening_balance or
     round(p_expected_closing, 2) <> p_expected_closing or
     abs(p_opening_balance) >= 10000000000000 or abs(p_expected_closing) >= 10000000000000 then
    raise exception 'Invalid decimal balance';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or
     jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Invalid statement movement count';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rows) as movement(value)
    where jsonb_typeof(value) <> 'object' or
          not (value ?& array['amount', 'transaction_date', 'description']) or
          value - 'amount' - 'transaction_date' - 'description' <> '{}'::jsonb or
          (value->>'amount') !~ '^-?[0-9]{1,13}\.[0-9]{2}$' or
          (value->>'transaction_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or
          length(trim(value->>'description')) not between 1 and 500 or
          (value->>'amount')::numeric = 0
  ) then
    raise exception 'Invalid statement movement';
  end if;

  select count(*), sum(amount), max(transaction_date)
  into movement_count, movement_sum, latest_date
  from jsonb_to_recordset(p_rows) as movement(amount numeric(15, 2), transaction_date date, description text);
  if p_last_date is null or movement_count <> jsonb_array_length(p_rows) or latest_date <> p_last_date or
     p_opening_balance + movement_sum <> p_expected_closing then
    raise exception 'Statement balance or completion date does not reconcile';
  end if;

  update public.payment_methods
  set initial_balance = p_opening_balance, current_balance = p_opening_balance
  where id = p_payment_method_id and workspace_id = p_workspace_id;

  insert into public.transactions (
    workspace_id, payment_method_id, amount, base_amount, currency,
    exchange_rate, description, transaction_date, created_by, source, transaction_type
  )
  select p_workspace_id, p_payment_method_id, movement.amount, movement.amount, p_currency,
         1, movement.description, movement.transaction_date, auth.uid(), 'csv',
         case when movement.amount < 0 then 'expense' else 'income' end
  from jsonb_to_recordset(p_rows) as movement(amount numeric(15, 2), transaction_date date, description text);

  update public.payment_methods
  set last_statement_imported_through = p_last_date
  where id = p_payment_method_id and workspace_id = p_workspace_id;
  select current_balance into actual_balance from public.payment_methods where id = p_payment_method_id;
  if actual_balance is distinct from p_expected_closing then
    raise exception 'Imported account balance does not match the statement';
  end if;
  return movement_count;
end;
$$;

revoke all on function public.import_revolut_initial_statement(uuid, uuid, text, numeric, numeric, date, jsonb)
  from public, anon;
grant execute on function public.import_revolut_initial_statement(uuid, uuid, text, numeric, numeric, date, jsonb)
  to authenticated;
