-- Run separately on source and isolated destination with psql -X -At -f.
-- Capture stdout ONLY to private, permission-restricted files outside git.
-- Zero DDL/DML. Transaction-level snapshot avoids inconsistent counts.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object(
  'tables', (
    SELECT jsonb_agg(jsonb_build_object('table', table_name, 'count', row_count) ORDER BY table_name)
    FROM (
      SELECT 'auth.users' table_name, count(*) row_count FROM auth.users
      UNION ALL SELECT 'public.workspaces', count(*) FROM public.workspaces
      UNION ALL SELECT 'public.workspace_members', count(*) FROM public.workspace_members
      UNION ALL SELECT 'public.workspace_invitations', count(*) FROM public.workspace_invitations
      UNION ALL SELECT 'public.payment_methods', count(*) FROM public.payment_methods
      UNION ALL SELECT 'public.transactions', count(*) FROM public.transactions
      UNION ALL SELECT 'public.transaction_categories', count(*) FROM public.transaction_categories
      UNION ALL SELECT 'public.profiles', count(*) FROM public.profiles
      UNION ALL SELECT 'public.categorization_rules', count(*) FROM public.categorization_rules
      UNION ALL SELECT 'public.transfer_rules', count(*) FROM public.transfer_rules
      UNION ALL SELECT 'public.merchants', count(*) FROM public.merchants
      UNION ALL SELECT 'public.subscriptions', count(*) FROM public.subscriptions
      UNION ALL SELECT 'public.transaction_tags', count(*) FROM public.transaction_tags
      UNION ALL SELECT 'public.transaction_tag_assignments', count(*) FROM public.transaction_tag_assignments
      UNION ALL SELECT 'storage.objects', count(*) FROM storage.objects WHERE bucket_id IN ('receipts','statements')
    ) counts
  ),
  'storage_counts', (
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY bucket_id, workspace_id), '[]'::jsonb)
    FROM (
      SELECT bucket_id, (string_to_array(name, '/'))[2] workspace_id, count(*) object_count
      FROM storage.objects WHERE bucket_id IN ('receipts', 'statements')
      GROUP BY bucket_id, (string_to_array(name, '/'))[2]
    ) s
  ),
  'workspace_counts', (
    SELECT coalesce(jsonb_agg(to_jsonb(counts) ORDER BY workspace_id), '[]'::jsonb)
    FROM (
      SELECT w.id workspace_id,
        (SELECT count(*) FROM public.workspace_members m WHERE m.workspace_id = w.id) members,
        (SELECT count(*) FROM public.workspace_invitations i WHERE i.workspace_id = w.id) invitations,
        (SELECT count(*) FROM public.payment_methods p WHERE p.workspace_id = w.id) payment_methods,
        (SELECT count(*) FROM public.transactions t WHERE t.workspace_id = w.id) transactions,
        (SELECT count(*) FROM public.transaction_categories c WHERE c.workspace_id = w.id) categories,
        (SELECT count(*) FROM public.merchants m WHERE m.workspace_id = w.id) merchants,
        (SELECT count(*) FROM public.categorization_rules r WHERE r.workspace_id = w.id) categorization_rules,
        (SELECT count(*) FROM public.transfer_rules r WHERE r.workspace_id = w.id) transfer_rules,
        (SELECT count(*) FROM public.subscriptions s WHERE s.workspace_id = w.id) subscriptions,
        (SELECT count(*) FROM public.transaction_tags g WHERE g.workspace_id = w.id) tags,
        (SELECT count(*) FROM public.transaction_tag_assignments a JOIN public.transactions t ON t.id = a.transaction_id WHERE t.workspace_id = w.id) tag_assignments
      FROM public.workspaces w
    ) counts
  ),
  'currency_counts', (
    SELECT coalesce(jsonb_agg(to_jsonb(totals) ORDER BY workspace_id, currency), '[]'::jsonb)
    FROM (
      SELECT workspace_id, currency, count(*) transactions,
        sum(amount) amount, sum(base_amount) base_amount,
        count(exchange_rate) exchange_rate_present
      FROM public.transactions GROUP BY workspace_id, currency
    ) totals
  ),
  'balances', (
    SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY workspace_id, id), '[]'::jsonb)
    FROM (
      SELECT p.id, p.workspace_id, p.currency, p.initial_balance, p.current_balance,
        p.initial_balance + coalesce(sum(t.amount), 0) calculated_balance,
        count(t.id) transaction_count
      FROM public.payment_methods p LEFT JOIN public.transactions t ON t.payment_method_id = p.id
      GROUP BY p.id
    ) b
  ),
  'fk_checks', (
    SELECT jsonb_build_object(
      'unvalidated_constraints', (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND NOT convalidated AND connamespace IN ('public'::regnamespace, 'auth'::regnamespace, 'storage'::regnamespace)),
      'cross_workspace_payment_methods', (SELECT count(*) FROM public.transactions t JOIN public.payment_methods p ON p.id = t.payment_method_id WHERE t.workspace_id <> p.workspace_id),
      'cross_workspace_tags', (SELECT count(*) FROM public.transaction_tag_assignments a JOIN public.transactions t ON t.id = a.transaction_id JOIN public.transaction_tags g ON g.id = a.tag_id WHERE t.workspace_id <> g.workspace_id)
    )
  )
);
COMMIT;
