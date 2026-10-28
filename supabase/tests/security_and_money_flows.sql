-- Security and money-flow test suite for the Glade/Saage Bank database.
--
-- HOW IT WORKS
--   Runs entirely inside ONE transaction that is deliberately rolled back at the end (the final
--   RAISE EXCEPTION carries the report). It impersonates real roles (customer, support, compliance,
--   finance, admin, service_role, anon) by setting request.jwt.claims and SET LOCAL ROLE, so Row Level
--   Security, column grants and function EXECUTE grants are exercised exactly as PostgREST would.
--   An "error" containing TESTRESULTS is the NORMAL output, not a failure.
--
-- WHERE TO RUN IT
--   A development project or Supabase branch, via the SQL editor or `supabase db query`. It inserts
--   throwaway auth.users rows and fixtures, all rolled back, but do not run it against production.
--
-- NOT COVERED HERE (see docs/SECURITY_AND_READINESS.md)
--   True parallel sessions (a single session cannot race itself), Edge Functions, Supabase Auth
--   settings (rate limits, brute-force protection, MFA), and provider webhook signatures.

create temp table res(n bigserial primary key, line text);
create temp table kv(k text primary key, v text);

create function pg_temp.g(p_k text) returns text language sql as $f$ select v from kv where k = p_k $f$;

create function pg_temp.chk(p_name text, p_uid uuid, p_role text, p_sql text, p_expect text default null, p_store text default null)
returns void language plpgsql as $f$
declare v_out text; v_line text;
begin
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', p_role)::text, true);
    execute format('set local role %I', p_role);
    execute p_sql into v_out;
    execute 'reset role';
    if p_expect is null then v_line := 'PASS: ' || p_name;
    else v_line := 'FAIL: ' || p_name || ' (expected error containing: ' || p_expect || ')'; end if;
  exception when others then
    if p_expect is not null and sqlerrm ilike '%' || p_expect || '%' then v_line := 'PASS: ' || p_name;
    else v_line := 'FAIL: ' || p_name || ' => ' || sqlerrm; end if;
    v_out := null;
  end;
  insert into res(line) values (v_line);
  if p_store is not null and v_out is not null then
    insert into kv values (p_store, v_out) on conflict (k) do update set v = excluded.v;
  end if;
end $f$;

create function pg_temp.eq(p_name text, p_sql text, p_expected text) returns void language plpgsql as $f$
declare v text;
begin
  execute p_sql into v;
  insert into res(line) values (case when v is not distinct from p_expected then 'PASS: ' || p_name
    else 'FAIL: ' || p_name || ' => got ' || coalesce(v, 'NULL') || ', expected ' || p_expected end);
exception when others then insert into res(line) values ('FAIL: ' || p_name || ' => ' || sqlerrm);
end $f$;

do $do$
declare
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); us uuid := gen_random_uuid();
  uc uuid := gen_random_uuid(); uf uuid := gen_random_uuid(); uad uuid := gen_random_uuid();
  ux uuid := gen_random_uuid(); uy uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, aud, role)
  select u, n || '@test.invalid', case when n = 'unconfirmed' then null else now() end,
         '{"country_of_residence":"NG"}'::jsonb, 'authenticated', 'authenticated'
  from (values (ua,'alice'),(ub,'bob'),(us,'support'),(uc,'compliance'),(uf,'finance'),(uad,'admin'),(ux,'xavier'),(uy,'unconfirmed')) v(u, n);
  insert into public.staff_roles (user_id, role) values (us,'support'),(uc,'compliance'),(uf,'finance'),(uad,'admin');
  update public.app_settings set value = '"demo"' where key = 'app_mode';
  insert into public.transaction_limits (country, currency, verification_status, per_transfer_max, daily_max)
  values (null, 'NGN', 'verified', 100000, 150000);

  -- ===== ACCESS CONTROL / ISOLATION =====
  perform pg_temp.chk('signup trigger created profile + verification rows', ua, 'authenticated', 'select (1/(case when (select count(*) from public.customer_verifications)=1 and (select count(*) from public.profiles)=1 then 1 else 0 end))::text');
  perform pg_temp.chk('customer sees no staff-only data', ua, 'authenticated', 'select (1/(case when (select count(*) from public.audit_logs)+(select count(*) from public.risk_reviews)+(select count(*) from public.staff_roles)+(select count(*) from public.webhook_events)+(select count(*) from public.transaction_limits)+(select count(*) from public.app_settings)=0 then 1 else 0 end))::text');
  perform pg_temp.chk('customer cannot change demo_mode', ua, 'authenticated', format($q$with x as (update public.profiles set demo_mode=false where id=%L returning 1) select count(*)::text from x$q$, ua), 'permission denied');
  perform pg_temp.chk('customer cannot grant self a staff role (table)', ua, 'authenticated', format($q$with x as (insert into public.staff_roles(user_id,role) values (%L,'admin') returning 1) select count(*)::text from x$q$, ua), 'permission denied');
  perform pg_temp.chk('customer cannot grant self a staff role (rpc)', ua, 'authenticated', format($q$select public.staff_grant_role(%L,'admin')::text$q$, ua), 'Forbidden');
  perform pg_temp.chk('customer cannot edit balance', ua, 'authenticated', $q$with x as (update public.accounts set balance=999999 returning 1) select count(*)::text from x$q$, 'permission denied');
  perform pg_temp.chk('customer cannot call post_ledger_entry', ua, 'authenticated', $q$select public.post_ledger_entry(gen_random_uuid(),'credit',100,'x')::text$q$, 'permission denied');
  perform pg_temp.chk('customer cannot call confirm_incoming_payment', ua, 'authenticated', $q$select public.confirm_incoming_payment(gen_random_uuid())::text$q$, 'permission denied');
  perform pg_temp.chk('customer cannot call server_begin_processing', ua, 'authenticated', $q$select public.server_begin_processing(gen_random_uuid())::text$q$, 'permission denied');
  perform pg_temp.chk('customer cannot call server_apply_provider_status', ua, 'authenticated', $q$select public.server_apply_provider_status(gen_random_uuid(),'completed')::text$q$, 'permission denied');
  perform pg_temp.chk('customer cannot write webhook events', ua, 'authenticated', $q$select count(*)::text from public.server_record_webhook_event('x','e1','t','{}',true)$q$, 'permission denied');
  perform pg_temp.chk('anonymous cannot create transfers', ua, 'anon', $q$select public.create_transfer('anon-key-0001','international','NG','NGN','GB','GBP',1000)::text$q$, 'permission denied');
  perform pg_temp.chk('beneficiary glade_user_id not client-writable', ua, 'authenticated', format($q$with x as (insert into public.beneficiaries(user_id,full_name,country,currency,glade_user_id) values (%L,'x','GB','GBP',%L) returning 1) select count(*)::text from x$q$, ua, ub), 'permission denied');
  perform pg_temp.chk('cannot create beneficiary for another user', ua, 'authenticated', format($q$with x as (insert into public.beneficiaries(user_id,full_name,country,currency) values (%L,'x','GB','GBP') returning 1) select count(*)::text from x$q$, ub), 'row-level security');
  perform pg_temp.chk('create beneficiary A', ua, 'authenticated', format($q$with x as (insert into public.beneficiaries(user_id,full_name,country,currency,bank_name,account_number) values (%L,'Alice Recipient','GB','GBP','Test Bank','ACC12345') returning id) select id::text from x$q$, ua), null, 'benA');
  perform pg_temp.chk('create beneficiary B', ub, 'authenticated', format($q$with x as (insert into public.beneficiaries(user_id,full_name,country,currency,bank_name,account_number) values (%L,'Bob Recipient','GB','GBP','Test Bank','ACC77777') returning id) select id::text from x$q$, ub), null, 'benB');
  perform pg_temp.chk('A cannot update B beneficiary (RLS filters row)', ua, 'authenticated', format($q$with x as (update public.beneficiaries set full_name='hacked' where id=%L returning 1) select count(*)::text from x$q$, pg_temp.g('benB')));
  perform pg_temp.eq('B beneficiary unchanged', format($q$select full_name from public.beneficiaries where id=%L$q$, pg_temp.g('benB')), 'Bob Recipient');
  perform pg_temp.chk('payout detail change allowed for owner', ua, 'authenticated', format($q$with x as (update public.beneficiaries set account_number='ACC99999' where id=%L returning 1) select count(*)::text from x$q$, pg_temp.g('benA')));
  perform pg_temp.eq('payout detail change was audit-logged', $q$select count(*)::text from public.audit_logs where action='beneficiary.payout_details_changed'$q$, '1');

  -- ===== SUPPORT =====
  perform pg_temp.chk('customer ticket status forced to open', ua, 'authenticated', format($q$with x as (insert into public.support_tickets(user_id,subject,message,status) values (%L,'Help me','Need help here','resolved') returning id) select id::text from x$q$, ua), null, 'tk');
  perform pg_temp.eq('ticket status is open', format($q$select status from public.support_tickets where id=%L$q$, pg_temp.g('tk')), 'open');
  perform pg_temp.chk('customer can reply to own ticket', ua, 'authenticated', format($q$with x as (insert into public.support_ticket_messages(ticket_id,author_id,is_staff,body) values (%L,%L,false,'more info') returning 1) select count(*)::text from x$q$, pg_temp.g('tk'), ua));
  perform pg_temp.chk('customer cannot post as staff', ua, 'authenticated', format($q$with x as (insert into public.support_ticket_messages(ticket_id,author_id,is_staff,body) values (%L,%L,true,'fake staff') returning 1) select count(*)::text from x$q$, pg_temp.g('tk'), ua), 'row-level security');
  perform pg_temp.chk('other customer cannot read ticket messages', ub, 'authenticated', 'select (1/(case when (select count(*) from public.support_ticket_messages)=0 and (select count(*) from public.support_tickets)=0 then 1 else 0 end))::text');
  perform pg_temp.chk('support staff can reply', us, 'authenticated', format($q$with x as (insert into public.support_ticket_messages(ticket_id,author_id,is_staff,body) values (%L,%L,true,'We are looking into it') returning 1) select count(*)::text from x$q$, pg_temp.g('tk'), us));
  perform pg_temp.chk('support staff can see tickets', us, 'authenticated', 'select (1/(case when (select count(*) from public.support_tickets)>=1 then 1 else 0 end))::text');

  -- ===== DEMO TRANSFER LIFECYCLE =====
  perform pg_temp.chk('unverified customer cannot create transfer', ua, 'authenticated', format($q$select (public.create_transfer('key-nov-0001','international','NG','NGN','GB','GBP',50000,%L)).id::text$q$, pg_temp.g('benA')), 'Identity verification is required');
  perform pg_temp.chk('demo verification (demo mode only)', ua, 'authenticated', $q$select (public.demo_complete_verification()).status$q$);
  perform pg_temp.chk('unsupported destination rejected', ua, 'authenticated', $q$select (public.create_transfer('key-fr-00001','international','NG','NGN','FR','EUR',50000)).id::text$q$, 'not currently available');
  perform pg_temp.chk('other customer beneficiary rejected', ua, 'authenticated', format($q$select (public.create_transfer('key-ben-0001','international','NG','NGN','GB','GBP',50000,%L)).id::text$q$, pg_temp.g('benB')), 'Beneficiary not found');
  perform pg_temp.chk('per-transfer limit enforced', ua, 'authenticated', format($q$select (public.create_transfer('key-big-00001','international','NG','NGN','GB','GBP',120000,%L)).id::text$q$, pg_temp.g('benA')), 'per-transfer limit');
  perform pg_temp.chk('fractional-cent amount rejected', ua, 'authenticated', format($q$select (public.create_transfer('key-frac-0001','international','NG','NGN','GB','GBP',1000.123,%L)).id::text$q$, pg_temp.g('benA')), 'decimal places');
  perform pg_temp.chk('create transfer 1', ua, 'authenticated', format($q$select (public.create_transfer('key-a-0001','international','NG','NGN','GB','GBP',50000,%L)).id::text$q$, pg_temp.g('benA')), null, 't1');
  perform pg_temp.chk('duplicate idempotency key returns same transfer', ua, 'authenticated', format($q$select (public.create_transfer('key-a-0001','international','NG','NGN','GB','GBP',50000,%L)).id::text$q$, pg_temp.g('benA')), null, 't1dup');
  perform pg_temp.eq('duplicate did not create a second transfer', $q$select (pg_temp.g('t1') = pg_temp.g('t1dup') and (select count(*) from public.transfers where idempotency_key='key-a-0001')=1)::text$q$, 'true');
  perform pg_temp.eq('demo transfer is flagged demo with demo provider', format($q$select is_demo::text || provider_code from public.transfers where id=%L$q$, pg_temp.g('t1')), 'truedemo');
  perform pg_temp.chk('cannot confirm without quote', ua, 'authenticated', format($q$select (public.confirm_transfer(%L)).status$q$, pg_temp.g('t1')), 'quote');
  perform pg_temp.chk('demo quote', ua, 'authenticated', format($q$select (public.demo_quote_transfer(%L)).fee_amount::text$q$, pg_temp.g('t1')));
  perform pg_temp.eq('quote fee and recipient amount', format($q$select fee_amount::text || '/' || destination_amount::text from public.transfers where id=%L$q$, pg_temp.g('t1')), '500.00/26.00');
  perform pg_temp.chk('confirm transfer', ua, 'authenticated', format($q$select (public.confirm_transfer(%L)).status$q$, pg_temp.g('t1')));
  perform pg_temp.chk('cannot submit without funding account', ua, 'authenticated', format($q$select (public.demo_submit_transfer(%L)).status$q$, pg_temp.g('t1')), 'No funding account');
  perform pg_temp.chk('add demo funds', ua, 'authenticated', $q$select (public.demo_add_funds('NGN',100000)).balance::text$q$);
  perform pg_temp.chk('submit transfer (debits amount + fee)', ua, 'authenticated', format($q$select (public.demo_submit_transfer(%L)).status$q$, pg_temp.g('t1')));
  perform pg_temp.eq('balance after debit', format($q$select balance::text from public.accounts where user_id=%L and is_demo$q$, ua), '49500.00');
  perform pg_temp.chk('customer cannot mark transfer completed directly', ua, 'authenticated', format($q$with x as (update public.transfers set status='completed' where id=%L returning 1) select count(*)::text from x$q$, pg_temp.g('t1')), 'permission denied');
  perform pg_temp.chk('settle completed (demo)', ua, 'authenticated', format($q$select (public.demo_settle_transfer(%L,'completed')).status$q$, pg_temp.g('t1')));
  perform pg_temp.chk('cannot settle twice', ua, 'authenticated', format($q$select (public.demo_settle_transfer(%L,'completed')).status$q$, pg_temp.g('t1')), 'not processing');
  perform pg_temp.chk('create transfer 2', ua, 'authenticated', format($q$select (public.create_transfer('key-a-0002','international','NG','NGN','GB','GBP',20000,%L)).id::text$q$, pg_temp.g('benA')), null, 't2');
  perform pg_temp.chk('quote 2', ua, 'authenticated', format($q$select (public.demo_quote_transfer(%L)).status$q$, pg_temp.g('t2')));
  perform pg_temp.chk('confirm 2', ua, 'authenticated', format($q$select (public.confirm_transfer(%L)).status$q$, pg_temp.g('t2')));
  perform pg_temp.chk('submit 2', ua, 'authenticated', format($q$select (public.demo_submit_transfer(%L)).status$q$, pg_temp.g('t2')));
  perform pg_temp.chk('simulate failure', ua, 'authenticated', format($q$select (public.demo_settle_transfer(%L,'failed')).status$q$, pg_temp.g('t2')));
  perform pg_temp.eq('failed transfer was refunded', format($q$select status from public.transfers where id=%L$q$, pg_temp.g('t2')), 'refunded');
  perform pg_temp.eq('balance restored after refund', format($q$select balance::text from public.accounts where user_id=%L and is_demo$q$, ua), '49500.00');
  perform pg_temp.eq('refund posted exactly once', format($q$select count(*)::text from public.ledger_entries where transfer_id=%L and direction='credit'$q$, pg_temp.g('t2')), '1');

  -- ===== RISK REVIEW HOOK + STAFF PERMISSIONS =====
  perform pg_temp.chk('create transfer 3 (near limit)', ua, 'authenticated', format($q$select (public.create_transfer('key-a-0003','international','NG','NGN','GB','GBP',85000,%L)).id::text$q$, pg_temp.g('benA')), null, 't3');
  perform pg_temp.eq('risk review opened automatically', format($q$select count(*)::text from public.risk_reviews where transfer_id=%L and status='open'$q$, pg_temp.g('t3')), '1');
  insert into pg_temp.kv select 'risk3', id::text from public.risk_reviews where transfer_id = pg_temp.g('t3')::uuid;
  perform pg_temp.chk('quote 3', ua, 'authenticated', format($q$select (public.demo_quote_transfer(%L)).status$q$, pg_temp.g('t3')));
  perform pg_temp.chk('cannot confirm while review open', ua, 'authenticated', format($q$select (public.confirm_transfer(%L)).status$q$, pg_temp.g('t3')), 'manual review');
  perform pg_temp.chk('customer cannot resolve review', ua, 'authenticated', format($q$select (public.staff_resolve_risk_review(%L,'approve','ok')).status$q$, pg_temp.g('risk3')), 'Forbidden');
  perform pg_temp.chk('support cannot resolve review', us, 'authenticated', format($q$select (public.staff_resolve_risk_review(%L,'approve','ok')).status$q$, pg_temp.g('risk3')), 'Forbidden');
  perform pg_temp.chk('review requires notes', uc, 'authenticated', format($q$select (public.staff_resolve_risk_review(%L,'approve',''))::text$q$, pg_temp.g('risk3')), 'notes are required');
  perform pg_temp.chk('compliance resolves review', uc, 'authenticated', format($q$select (public.staff_resolve_risk_review(%L,'approve','Checked source of funds'))::text$q$, pg_temp.g('risk3')));
  perform pg_temp.chk('confirm after approval', ua, 'authenticated', format($q$select (public.confirm_transfer(%L)).status$q$, pg_temp.g('t3')));
  perform pg_temp.chk('daily limit enforced', ua, 'authenticated', format($q$select (public.create_transfer('key-a-0004','international','NG','NGN','GB','GBP',20000,%L)).id::text$q$, pg_temp.g('benA')), 'daily transfer limit');
  perform pg_temp.chk('B submits verification', ub, 'authenticated', $q$select (public.submit_verification('Bob Test','1990-01-01','1 Test St',null,'Lagos','Lagos','100001','NG')).status$q$);
  perform pg_temp.chk('support cannot approve verification', us, 'authenticated', format($q$select (public.staff_review_verification(%L,'approve'))::text$q$, ub), 'Forbidden');
  perform pg_temp.chk('compliance approves verification', uc, 'authenticated', format($q$select (public.staff_review_verification(%L,'approve')).status$q$, ub));
  perform pg_temp.chk('cannot re-review non-pending verification', uc, 'authenticated', format($q$select (public.staff_review_verification(%L,'reject','x')).status$q$, ub), 'Only pending');
  perform pg_temp.chk('staff can read audit logs', uc, 'authenticated', 'select (1/(case when (select count(*) from public.audit_logs)>0 then 1 else 0 end))::text');
  perform pg_temp.chk('customer isolation: B sees none of A data', ub, 'authenticated', format($q$select (1/(case when (select count(*) from public.transfers where user_id<>%L)=0 and (select count(*) from public.accounts where user_id<>%L)=0 and (select count(*) from public.ledger_entries)=0 and (select count(*) from public.beneficiaries where user_id<>%L)=0 then 1 else 0 end))::text$q$, ub, ub, ub));
  perform pg_temp.chk('support staff can see all transfers', us, 'authenticated', 'select (1/(case when (select count(*) from public.transfers)>=3 then 1 else 0 end))::text');
  perform pg_temp.chk('support cannot see OTHER customers verification data', us, 'authenticated', format($q$select (1/(case when (select count(*) from public.customer_verifications where user_id<>%L)=0 then 1 else 0 end))::text$q$, us));
  perform pg_temp.chk('compliance cannot change settings', uc, 'authenticated', $q$select (public.staff_set_setting('feature_receiving','true'))::text$q$, 'Forbidden');
  perform pg_temp.chk('admin invalid app_mode rejected', uad, 'authenticated', $q$select (public.staff_set_setting('app_mode','"bogus"'))::text$q$, 'Invalid app mode');
  perform pg_temp.chk('admin unknown setting rejected', uad, 'authenticated', $q$select (public.staff_set_setting('hack','true'))::text$q$, 'Unknown setting');
  perform pg_temp.chk('admin grants role to verified user', uad, 'authenticated', format($q$select (public.staff_grant_role(%L,'support')).role$q$, ux));
  perform pg_temp.chk('cannot grant role to unverified email', uad, 'authenticated', format($q$select (public.staff_grant_role(%L,'support')).role$q$, uy), 'not verified');
  perform pg_temp.chk('admin cannot change own role', uad, 'authenticated', format($q$select (public.staff_grant_role(%L,'support')).role$q$, uad), 'own role');
  perform pg_temp.chk('compliance cannot grant roles', uc, 'authenticated', format($q$select (public.staff_grant_role(%L,'admin')).role$q$, ub), 'Forbidden');
  perform pg_temp.chk('admin revokes role', uad, 'authenticated', format($q$select (public.staff_revoke_role(%L))::text$q$, ux));

  -- ===== LEDGER INTEGRITY + RECONCILIATION =====
  perform pg_temp.chk('ledger entries are immutable (update)', null, 'postgres', $q$with x as (update public.ledger_entries set amount=1 returning 1) select count(*)::text from x$q$, 'append-only');
  perform pg_temp.chk('audit logs are immutable (delete)', null, 'postgres', $q$with x as (delete from public.audit_logs returning 1) select count(*)::text from x$q$, 'append-only');
  perform pg_temp.eq('every balance equals ledger sum', $q$select count(*)::text from public.accounts a where a.balance <> (select coalesce(sum(case direction when 'credit' then amount else -amount end),0) from public.ledger_entries l where l.account_id=a.id)$q$, '0');
  perform pg_temp.chk('finance reconciliation reports clean', uf, 'authenticated', 'select (1/(case when (select count(*) from public.reconcile_account_balances())=0 then 1 else 0 end))::text');
  perform pg_temp.chk('customer cannot run reconciliation', ua, 'authenticated', 'select count(*)::text from public.reconcile_account_balances()', 'Forbidden');
  update public.accounts set balance = balance + 1 where user_id = ua and is_demo;
  perform pg_temp.chk('reconciliation detects a tampered balance', uf, 'authenticated', 'select (1/(case when (select count(*) from public.reconcile_account_balances())=1 then 1 else 0 end))::text');
  update public.accounts set balance = balance - 1 where user_id = ua and is_demo;
  perform pg_temp.chk('balance cannot go negative (ledger)', null, 'service_role', format($q$select public.post_ledger_entry((select id from public.accounts where user_id=%L and is_demo),'debit',99999999,'x')::text$q$, ua), 'Insufficient funds');

  -- ===== MODE SWITCH + PRODUCTION SEPARATION =====
  perform pg_temp.chk('mode cannot change while demo transfers in flight', uad, 'authenticated', $q$select (public.staff_set_setting('app_mode','"production"'))::text$q$, 'in flight');
  perform pg_temp.chk('cancel in-flight demo transfer', ua, 'authenticated', format($q$select (public.cancel_transfer(%L)).status$q$, pg_temp.g('t3')));
  perform pg_temp.chk('provider payments blocked in demo mode', null, 'service_role', $q$select public.server_process_incoming_payment('testprov','P0','VA1',100,'NGN')::text$q$, 'only processed in production');
  perform pg_temp.chk('admin switches to production', uad, 'authenticated', $q$select (public.staff_set_setting('app_mode','"production"'))::text$q$);
  perform pg_temp.chk('demo funds disabled in production', ua, 'authenticated', $q$select (public.demo_add_funds('NGN',1000)).balance::text$q$, 'disabled in production');
  perform pg_temp.chk('demo verification disabled in production', ub, 'authenticated', $q$select (public.demo_complete_verification()).status$q$, 'disabled in production');
  perform pg_temp.chk('demo settle disabled in production', ua, 'authenticated', format($q$select (public.demo_settle_transfer(%L,'completed')).status$q$, pg_temp.g('t1')), 'disabled in production');
  perform pg_temp.chk('international disabled by feature flag in production', ua, 'authenticated', format($q$select (public.create_transfer('key-p-0001','international','NG','NGN','GB','GBP',5000,%L)).id::text$q$, pg_temp.g('benA')), 'not currently enabled');
  perform pg_temp.chk('admin enables international flag', uad, 'authenticated', $q$select (public.staff_set_setting('feature_international_transfers','true'))::text$q$);
  perform pg_temp.chk('production never routes via demo corridor', ua, 'authenticated', format($q$select (public.create_transfer('key-p-0002','international','NG','NGN','GB','GBP',5000,%L)).id::text$q$, pg_temp.g('benA')), 'not currently available');
  perform pg_temp.chk('demo corridors invisible in production', ua, 'authenticated', 'select (1/(case when (select count(*) from public.provider_corridors)=0 then 1 else 0 end))::text');
  perform pg_temp.chk('demo transfer cannot use provider confirmation path', null, 'service_role', format($q$select (public.server_apply_provider_status(%L,'completed',null,'X1')).status$q$, pg_temp.g('t1')), 'Demo transfers never use provider');

  -- real-provider fixtures (rolled back with everything else)
  insert into public.payment_providers (code, display_name, capabilities, is_enabled, is_sandbox) values ('testprov','Test provider (rolled back)','{international_transfer}', true, true);
  insert into public.provider_corridors (provider_id, transfer_type, source_country, source_currency, destination_country, destination_currency, min_amount, requires_verification, is_approved, approved_at)
    select id, 'international','NG','NGN','GB','GBP',100,true,true,now() from public.payment_providers where code='testprov';
  insert into public.virtual_accounts (user_id, provider_code, currency, country, account_name, account_number, provider_reference) values (ub,'testprov','NGN','NG','Bob Test','0000000000','VA1');
  insert into public.accounts (user_id, currency, is_demo) values (ub,'NGN',false);

  -- ===== RECEIVING MONEY =====
  perform pg_temp.chk('incoming payment credits customer', null, 'service_role', $q$select public.server_process_incoming_payment('testprov','P1','VA1',5000,'NGN','Sender Ltd','{}',50)::text$q$, null, 'inc1');
  perform pg_temp.eq('net amount credited (amount - fee)', format($q$select balance::text from public.accounts where user_id=%L and not is_demo$q$, ub), '4950.00');
  perform pg_temp.chk('duplicate provider payment does not double-credit', null, 'service_role', $q$select public.server_process_incoming_payment('testprov','P1','VA1',5000,'NGN','Sender Ltd','{}',50)::text$q$, null, 'inc1b');
  perform pg_temp.eq('same payment id and balance unchanged', format($q$select (pg_temp.g('inc1')=pg_temp.g('inc1b') and (select balance from public.accounts where user_id=%L and not is_demo)=4950 and (select count(*) from public.ledger_entries where incoming_payment_id=%L)=1)::text$q$, ub, pg_temp.g('inc1')), 'true');
  perform pg_temp.chk('wrong currency rejected', null, 'service_role', $q$select public.server_process_incoming_payment('testprov','P2','VA1',5000,'USD')::text$q$, 'does not match');
  perform pg_temp.chk('unknown receiving account rejected', null, 'service_role', $q$select public.server_process_incoming_payment('testprov','P3','NOPE',5000,'NGN')::text$q$, 'Unknown receiving account');
  perform pg_temp.chk('invalid amount rejected', null, 'service_role', $q$select public.server_process_incoming_payment('testprov','P4','VA1',-5,'NGN')::text$q$, 'Invalid amount');
  perform pg_temp.chk('customer cannot trigger incoming payment', ua, 'authenticated', $q$select public.server_process_incoming_payment('testprov','P5','VA1',5000,'NGN')::text$q$, 'permission denied');
  perform pg_temp.chk('webhook event recorded (first)', null, 'service_role', $q$select (select count(*) from public.server_record_webhook_event('testprov','evt-1','payment.received','{"a":1}',true))::text || '/' || (select is_duplicate::text from public.server_record_webhook_event('testprov','evt-0','payment.received','{"a":1}',true))$q$, null, 'w1');
  perform pg_temp.chk('webhook duplicate returns exactly one row flagged duplicate', null, 'service_role', $q$select (select count(*) from public.server_record_webhook_event('testprov','evt-0','payment.received','{"a":1}',true))::text || '/' || (select is_duplicate::text from public.server_record_webhook_event('testprov','evt-0','payment.received','{"a":1}',true))$q$, null, 'w2');
  perform pg_temp.eq('webhook dedupe results', $q$select pg_temp.g('w2') || '/' || (select count(*) from public.webhook_events where event_id='evt-0')$q$, '1/true/1');

  -- ===== PRODUCTION TRANSFER PATH =====
  update public.transaction_limits set is_active = false;
  perform pg_temp.chk('production requires a configured limit (fail closed)', ub, 'authenticated', format($q$select (public.create_transfer('key-b-0000','international','NG','NGN','GB','GBP',3000,%L)).id::text$q$, pg_temp.g('benB')), 'No transfer limit is configured');
  update public.transaction_limits set is_active = true;
  perform pg_temp.chk('create real transfer', ub, 'authenticated', format($q$select (public.create_transfer('key-b-0001','international','NG','NGN','GB','GBP',3000,%L)).id::text$q$, pg_temp.g('benB')), null, 'tb1');
  perform pg_temp.eq('real transfer is not demo, uses testprov', format($q$select is_demo::text || provider_code from public.transfers where id=%L$q$, pg_temp.g('tb1')), 'falsetestprov');
  perform pg_temp.chk('customer cannot apply a provider quote', ub, 'authenticated', format($q$select (public.server_apply_quote(%L,100,0.0005,1.5,'Q1',now()+interval '10 minutes')).status$q$, pg_temp.g('tb1')), 'permission denied');
  perform pg_temp.chk('server applies quote', null, 'service_role', format($q$select (public.server_apply_quote(%L,100,0.0005,1.5,'Q1',now()+interval '10 minutes')).status$q$, pg_temp.g('tb1')));
  perform pg_temp.chk('customer confirms', ub, 'authenticated', format($q$select (public.confirm_transfer(%L)).status$q$, pg_temp.g('tb1')));
  perform pg_temp.chk('server begins processing (debit)', null, 'service_role', format($q$select (public.server_begin_processing(%L)).status$q$, pg_temp.g('tb1')));
  perform pg_temp.eq('real balance after debit', format($q$select balance::text from public.accounts where user_id=%L and not is_demo$q$, ub), '1850.00');
  perform pg_temp.chk('cannot complete without provider reference', null, 'service_role', format($q$select (public.server_apply_provider_status(%L,'completed'))::text$q$, pg_temp.g('tb1')), 'Provider reference required');
  perform pg_temp.chk('authoritative completion with reference', null, 'service_role', format($q$select (public.server_apply_provider_status(%L,'completed',null,'MAP-1')).status$q$, pg_temp.g('tb1')));
  perform pg_temp.chk('duplicate completion event is idempotent', null, 'service_role', format($q$select (public.server_apply_provider_status(%L,'completed',null,'MAP-1')).status$q$, pg_temp.g('tb1')));
  perform pg_temp.chk('reference mismatch rejected', null, 'service_role', format($q$select (public.server_apply_provider_status(%L,'completed',null,'OTHER')).status$q$, pg_temp.g('tb1')), 'mismatch');
  perform pg_temp.chk('late failure after completion does not flip status', null, 'service_role', format($q$select (public.server_apply_provider_status(%L,'failed','late',null)).status$q$, pg_temp.g('tb1')));
  perform pg_temp.eq('status stays completed and review raised', format($q$select (select status from public.transfers where id=%L) || '/' || (select count(*) from public.risk_reviews where transfer_id=%L and reason like 'Provider reported failure%%')$q$, pg_temp.g('tb1'), pg_temp.g('tb1')), 'completed/1');
  perform pg_temp.chk('create real transfer 2', ub, 'authenticated', format($q$select (public.create_transfer('key-b-0002','international','NG','NGN','GB','GBP',1000,%L)).id::text$q$, pg_temp.g('benB')), null, 'tb2');
  perform pg_temp.chk('quote 2', null, 'service_role', format($q$select (public.server_apply_quote(%L,50,0.0005,0.5,'Q2',now()+interval '10 minutes')).status$q$, pg_temp.g('tb2')));
  perform pg_temp.chk('confirm 2', ub, 'authenticated', format($q$select (public.confirm_transfer(%L)).status$q$, pg_temp.g('tb2')));
  perform pg_temp.chk('begin 2', null, 'service_role', format($q$select (public.server_begin_processing(%L)).status$q$, pg_temp.g('tb2')));
  perform pg_temp.chk('provider rejects transfer', null, 'service_role', format($q$select (public.server_apply_provider_status(%L,'failed','Provider rejected'))::text$q$, pg_temp.g('tb2')));
  perform pg_temp.chk('duplicate failure event is idempotent', null, 'service_role', format($q$select (public.server_apply_provider_status(%L,'failed','Provider rejected')).status$q$, pg_temp.g('tb2')));
  perform pg_temp.eq('failed real transfer refunded once, balance restored', format($q$select (select status from public.transfers where id=%L) || '/' || (select balance from public.accounts where user_id=%L and not is_demo) || '/' || (select count(*) from public.ledger_entries where transfer_id=%L and direction='credit')$q$, pg_temp.g('tb2'), ub, pg_temp.g('tb2')), 'refunded/1850.00/1');
  perform pg_temp.chk('stale-transfer sweep: service ok', null, 'service_role', 'select count(*)::text from public.stale_processing_transfers(1)');
  perform pg_temp.chk('stale-transfer sweep: customer blocked', ua, 'authenticated', 'select count(*)::text from public.stale_processing_transfers(1)', 'Forbidden');
  perform pg_temp.eq('reconciliation still clean after real flows', $q$select count(*)::text from public.accounts a where a.balance <> (select coalesce(sum(case direction when 'credit' then amount else -amount end),0) from public.ledger_entries l where l.account_id=a.id)$q$, '0');

  -- ===== FAIL-SAFE MODE =====
  update public.app_settings set value = '"bogus"' where key = 'app_mode';
  perform pg_temp.chk('invalid app mode fails closed', ub, 'authenticated', format($q$select (public.create_transfer('key-b-0003','international','NG','NGN','GB','GBP',1000,%L)).id::text$q$, pg_temp.g('benB')), 'missing or invalid');
  delete from public.app_settings where key = 'app_mode';
  perform pg_temp.chk('missing app mode fails closed', ub, 'authenticated', format($q$select (public.create_transfer('key-b-0004','international','NG','NGN','GB','GBP',1000,%L)).id::text$q$, pg_temp.g('benB')), 'missing or invalid');

  raise exception E'TESTRESULTS\n%\n\nPASS=% FAIL=%',
    (select string_agg(line, E'\n' order by n) from pg_temp.res),
    (select count(*) from pg_temp.res where line like 'PASS%'),
    (select count(*) from pg_temp.res where line like 'FAIL%');
end $do$;
