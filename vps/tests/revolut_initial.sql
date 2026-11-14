-- Synthetic-only native integration test. The gateway must run this against its
-- separate test container; all fixture data is rolled back, never production.
begin;
set local search_path = public, extensions;

-- Test-only role can create Auth fixtures; no real users, hashes or records.
insert into auth.users (id, email)
values ('11111111-1111-4111-8111-111111111111', 'fixture-a@example.invalid'),
       ('22222222-2222-4222-8222-222222222222', 'fixture-b@example.invalid');

insert into public.workspaces (id, name, created_by, primary_currency)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Fixture workspace A',
        '11111111-1111-4111-8111-111111111111', 'EUR'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Fixture workspace B',
        '22222222-2222-4222-8222-222222222222', 'EUR');
insert into public.workspace_members (workspace_id, user_id, role)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner'),
       ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'owner');
insert into public.payment_methods (id, workspace_id, name, type, currency, initial_balance,
                                    current_balance, created_by)
values ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'Fixture bank account', 'bank_account', 'EUR', 0, 0, '11111111-1111-4111-8111-111111111111');

-- Both additive migrations are required before the app can use the new fields.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'subscriptions'
                   and column_name = 'statement_match_text') or
     not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'subscriptions'
                   and column_name = 'archived_at') then
    raise exception 'Subscription additive columns missing';
  end if;
  if has_function_privilege('anon',
      'public.import_revolut_initial_statement(uuid,uuid,text,numeric,numeric,date,jsonb)', 'EXECUTE') or
     not has_function_privilege('authenticated',
      'public.import_revolut_initial_statement(uuid,uuid,text,numeric,numeric,date,jsonb)', 'EXECUTE') then
    raise exception 'Revolut RPC execute grants are not scoped to authenticated';
  end if;
end;
$$;

insert into public.subscriptions (id, workspace_id, name, amount, due_day, payment_method_id, created_by)
values ('44444444-4444-4444-8444-444444444444', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'Fixture subscription', 9.99, 15, '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111');
do $$
begin
  if not exists (select 1 from public.subscriptions where id = '44444444-4444-4444-8444-444444444444'
                 and billing_provider = 'direct' and billing_interval = 'monthly'
                 and billing_month is null and archived_at is null) then
    raise exception 'Existing subscription default behavior changed';
  end if;
end;
$$;
update public.subscriptions set name = 'Readable fixture', statement_match_text = 'FIXTURE BILL',
  billing_provider = 'apple', billing_interval = 'yearly', billing_month = 2
where id = '44444444-4444-4444-8444-444444444444';
do $$
begin
  if not exists (select 1 from public.subscriptions where id = '44444444-4444-4444-8444-444444444444'
                 and name = 'Readable fixture' and statement_match_text = 'FIXTURE BILL'
                 and billing_provider = 'apple' and billing_interval = 'yearly' and billing_month = 2) then
    raise exception 'Subscription edit fields did not persist';
  end if;
end;
$$;
update public.subscriptions set archived_at = now(), is_active = false
where id = '44444444-4444-4444-8444-444444444444';

-- The RPC runs as the signed-in authenticated role, not an admin bypass.
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$
declare imported integer;
begin
  if auth.uid() is distinct from '11111111-1111-4111-8111-111111111111'::uuid then
    raise exception 'Fixture auth context missing';
  end if;
  imported := public.import_revolut_initial_statement(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
    'EUR', 25.00, 50.00, '2026-01-03',
    '[{"amount":"40.00","transaction_date":"2026-01-01","description":"Fixture deposit"},
      {"amount":"-5.99","transaction_date":"2026-01-02","description":"Fixture fee-only movement"},
      {"amount":"-9.01","transaction_date":"2026-01-03","description":"Fixture expense"}]'::jsonb);
  if imported <> 3 or
     not exists (select 1 from public.payment_methods
                 where id = '33333333-3333-4333-8333-333333333333'
                   and initial_balance = 25.00 and current_balance = 50.00
                   and last_statement_imported_through = '2026-01-03') or
     (select count(*) from public.transactions
       where payment_method_id = '33333333-3333-4333-8333-333333333333') <> 3 or
     not exists (select 1 from public.transactions
                 where payment_method_id = '33333333-3333-4333-8333-333333333333'
                   and amount = -5.99 and description = 'Fixture fee-only movement') then
    raise exception 'Atomic initial import did not reconcile';
  end if;
end;
$$;

do $$
declare rejected boolean := false;
begin
  begin
    perform public.import_revolut_initial_statement(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
      'EUR', 25.00, 50.00, '2026-01-03',
      '[{"amount":"25.00","transaction_date":"2026-01-03","description":"Fixture duplicate"}]'::jsonb);
  exception when others then
    if sqlerrm not like 'Account is not eligible%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Duplicate import unexpectedly accepted'; end if;
end;
$$;

-- A different workspace user must not see or mutate this account via RPC.
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$
declare rejected boolean := false;
begin
  begin
    perform public.import_revolut_initial_statement(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
      'EUR', 25.00, 50.00, '2026-01-03',
      '[{"amount":"25.00","transaction_date":"2026-01-03","description":"Fixture cross-workspace"}]'::jsonb);
  exception when others then
    if sqlerrm not like 'Account is not eligible%' then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Cross-workspace import unexpectedly accepted'; end if;
  if exists (select 1 from public.payment_methods
             where id = '33333333-3333-4333-8333-333333333333') then
    raise exception 'Cross-workspace account was visible';
  end if;
end;
$$;

reset role;
rollback;
