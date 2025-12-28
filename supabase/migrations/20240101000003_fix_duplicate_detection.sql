-- Fix duplicate detection function: date subtraction returns integer (days), not interval
-- Replace extract(epoch from ...) with simple integer comparison

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
        and abs(t.transaction_date - transaction_date_param) <= 1
      then 90.0
      -- Similar amount (within 1%), same payment method, same date
      when abs((t.amount - amount_param) / nullif(amount_param, 0)) < 0.01
        and t.transaction_date = transaction_date_param
        and t.payment_method_id = payment_method_id_param
      then 85.0
      -- Similar amount, same payment method, within 1 day
      when abs((t.amount - amount_param) / nullif(amount_param, 0)) < 0.01
        and t.payment_method_id = payment_method_id_param
        and abs(t.transaction_date - transaction_date_param) <= 1
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
        and abs(t.transaction_date - transaction_date_param) <= 1)
      -- Similar amount (within 1%), same payment method, same date
      or (abs((t.amount - amount_param) / nullif(amount_param, 0)) < 0.01
        and t.transaction_date = transaction_date_param
        and t.payment_method_id = payment_method_id_param)
      -- Similar amount, same payment method, within 1 day
      or (abs((t.amount - amount_param) / nullif(amount_param, 0)) < 0.01
        and t.payment_method_id = payment_method_id_param
        and abs(t.transaction_date - transaction_date_param) <= 1)
    )
  order by similarity_score desc, t.transaction_date desc
  limit 10;
end;
$$;
