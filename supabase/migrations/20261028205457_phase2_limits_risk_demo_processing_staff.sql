
-- =========================================================
-- A. FIX: customers must not control beneficiaries.glade_user_id
-- =========================================================
revoke insert, update on public.beneficiaries from authenticated;
grant insert (user_id, full_name, country, currency, bank_name, account_number, routing_code, nickname)
  on public.beneficiaries to authenticated;
grant update (full_name, bank_name, account_number, routing_code, nickname)
  on public.beneficiaries to authenticated;

create or replace function public.audit_beneficiary_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_number is distinct from old.account_number
     or new.routing_code is distinct from old.routing_code
     or new.bank_name is distinct from old.bank_name then
    insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
    values (auth.uid(), 'customer', 'beneficiary.payout_details_changed', 'beneficiary', new.id::text,
      jsonb_build_object('account_number', new.account_number is distinct from old.account_number,
                         'routing_code', new.routing_code is distinct from old.routing_code,
                         'bank_name', new.bank_name is distinct from old.bank_name));
  end if;
  return null;
end; $$;
revoke all on function public.audit_beneficiary_change() from public, anon, authenticated;
create trigger beneficiaries_audit after update on public.beneficiaries
  for each row execute function public.audit_beneficiary_change();

-- =========================================================
-- B. APP MODE (fails closed) + AUDIT HELPER
-- =========================================================
create or replace function public.current_app_mode() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v text;
begin
  select value #>> '{}' into v from public.app_settings where key = 'app_mode';
  if v is null or v not in ('demo','production') then
    raise exception 'Application mode is missing or invalid';
  end if;
  return v;
end; $$;
revoke all on function public.current_app_mode() from public, anon;
grant execute on function public.current_app_mode() to authenticated, service_role;

create or replace function public._audit(p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  select role into v_role from public.staff_roles where user_id = auth.uid();
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (auth.uid(),
          coalesce(v_role, case when coalesce(auth.jwt() ->> 'role', '') = 'service_role' then 'system' else 'customer' end),
          p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end; $$;
revoke all on function public._audit(text,text,text,jsonb) from public, anon, authenticated;

-- =========================================================
-- C. DEMO ISOLATION
-- =========================================================
alter table public.transfers
  add column is_demo boolean not null default false,
  add column quote_expires_at timestamptz;
alter table public.transfers add constraint transfers_demo_provider_consistency
  check (is_demo = (coalesce(provider_code, '') = 'demo'));
create index risk_reviews_transfer_idx on public.risk_reviews (transfer_id);

insert into public.payment_providers (code, display_name, capabilities, is_enabled, is_sandbox, config)
values ('demo', 'Demo (simulated, no real money)', '{demo}', true, true, '{}'::jsonb);

insert into public.provider_corridors
  (provider_id, transfer_type, source_country, source_currency, destination_country, destination_currency,
   min_amount, max_amount, requires_verification, estimated_processing_time, is_approved, approved_at)
select p.id, 'international', 'NG', 'NGN', d.c, d.cur, 1000, 5000000, true, 'Simulated (demo)', true, now()
from public.payment_providers p, (values ('GB','GBP'),('US','USD')) as d(c, cur)
where p.code = 'demo';

create or replace function public.corridor_visible(p_provider_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.payment_providers p
                 where p.id = p_provider_id and (p.code = 'demo') = (public.current_app_mode() = 'demo'));
$$;
revoke all on function public.corridor_visible(uuid) from public, anon;
grant execute on function public.corridor_visible(uuid) to authenticated;
drop policy corridors_select_approved on public.provider_corridors;
create policy corridors_select_approved on public.provider_corridors for select to authenticated
  using (is_approved = true and public.corridor_visible(provider_id));

-- =========================================================
-- D. LIMITS
-- =========================================================
create or replace function public.enforce_transfer_limits(p_user uuid, p_country text, p_currency text, p_amount numeric, p_mode text)
returns numeric language plpgsql security definer set search_path = '' as $$
declare v_vs text; v_lim public.transaction_limits; v_sum numeric;
begin
  select case status when 'verified' then 'verified' when 'pending' then 'pending' else 'not_started' end
    into v_vs from public.customer_verifications where user_id = p_user;
  v_vs := coalesce(v_vs, 'not_started');
  select * into v_lim from public.transaction_limits
   where is_active and verification_status = v_vs
     and (country is null or country = upper(p_country))
     and (currency is null or currency = upper(p_currency))
   order by (country is not null) desc, (currency is not null) desc limit 1;
  if not found then
    if p_mode = 'production' then raise exception 'No transfer limit is configured for this route'; end if;
    return null;
  end if;
  if v_lim.per_transfer_max is not null and p_amount > v_lim.per_transfer_max then
    raise exception 'Amount exceeds your per-transfer limit';
  end if;
  if v_lim.daily_max is not null then
    select coalesce(sum(source_amount), 0) into v_sum from public.transfers
     where user_id = p_user and source_currency = upper(p_currency)
       and status not in ('cancelled','failed','refunded') and created_at > now() - interval '1 day';
    if v_sum + p_amount > v_lim.daily_max then raise exception 'Amount exceeds your daily transfer limit'; end if;
  end if;
  if v_lim.monthly_max is not null then
    select coalesce(sum(source_amount), 0) into v_sum from public.transfers
     where user_id = p_user and source_currency = upper(p_currency)
       and status not in ('cancelled','failed','refunded') and created_at > now() - interval '30 days';
    if v_sum + p_amount > v_lim.monthly_max then raise exception 'Amount exceeds your monthly transfer limit'; end if;
  end if;
  return v_lim.per_transfer_max;
end; $$;
revoke all on function public.enforce_transfer_limits(uuid,text,text,numeric,text) from public, anon, authenticated;

-- =========================================================
-- E. create_transfer: mode, flags, limits, risk hooks, serialisation per user
-- =========================================================
create or replace function public.create_transfer(
  p_idempotency_key text, p_transfer_type text,
  p_source_country text, p_source_currency text,
  p_destination_country text, p_destination_currency text,
  p_source_amount numeric,
  p_beneficiary_id uuid default null,
  p_recipient_name text default null, p_recipient_bank_name text default null,
  p_recipient_account_number text default null, p_recipient_routing_code text default null,
  p_purpose text default null, p_description text default null)
returns public.transfers language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_mode text;
  v_existing public.transfers;
  v_corridor public.provider_corridors;
  v_provider public.payment_providers;
  v_ben public.beneficiaries;
  v_name text := p_recipient_name;
  v_bank text := p_recipient_bank_name;
  v_acct text := p_recipient_account_number;
  v_route text := p_recipient_routing_code;
  v_row public.transfers;
  v_per_max numeric;
  v_bad int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 100 then
    raise exception 'A unique idempotency key is required';
  end if;
  -- serialise this user's transfer creation (limits + duplicate protection under concurrency)
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 1));

  select * into v_existing from public.transfers where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  v_mode := public.current_app_mode();
  if p_transfer_type not in ('international','local') then raise exception 'Invalid transfer type'; end if;
  if p_source_amount is null or p_source_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_source_amount <> round(p_source_amount, 2) then raise exception 'Amount can have at most 2 decimal places'; end if;

  if v_mode = 'production' and p_transfer_type = 'international'
     and not coalesce((select value = 'true'::jsonb from public.app_settings where key = 'feature_international_transfers'), false) then
    raise exception 'International transfers are not currently enabled';
  end if;

  select c.* into v_corridor
  from public.provider_corridors c
  join public.payment_providers p on p.id = c.provider_id
  where c.is_approved and p.is_enabled
    and ((p.code = 'demo') = (v_mode = 'demo'))
    and c.transfer_type = p_transfer_type
    and c.source_country = upper(p_source_country) and c.source_currency = upper(p_source_currency)
    and c.destination_country = upper(p_destination_country) and c.destination_currency = upper(p_destination_currency)
  order by c.created_at limit 1;
  if not found then raise exception 'This transfer route is not currently available'; end if;
  select * into v_provider from public.payment_providers where id = v_corridor.provider_id;

  if v_corridor.requires_verification and not exists (
    select 1 from public.customer_verifications where user_id = v_uid and status = 'verified') then
    raise exception 'Identity verification is required before sending money';
  end if;
  if p_source_amount < v_corridor.min_amount or (v_corridor.max_amount is not null and p_source_amount > v_corridor.max_amount) then
    raise exception 'Amount is outside the allowed range for this route';
  end if;
  if v_corridor.requires_purpose and (p_purpose is null or char_length(trim(p_purpose)) = 0) then
    raise exception 'Transfer purpose is required for this route';
  end if;

  v_per_max := public.enforce_transfer_limits(v_uid, p_source_country, p_source_currency, p_source_amount, v_mode);

  if p_beneficiary_id is not null then
    select * into v_ben from public.beneficiaries where id = p_beneficiary_id and user_id = v_uid;
    if not found then raise exception 'Beneficiary not found'; end if;
    if v_ben.country <> upper(p_destination_country) or v_ben.currency <> upper(p_destination_currency) then
      raise exception 'Beneficiary does not match the destination country and currency';
    end if;
    v_name := v_ben.full_name; v_bank := v_ben.bank_name; v_acct := v_ben.account_number; v_route := v_ben.routing_code;
  end if;
  if v_name is null or char_length(trim(v_name)) < 2 or char_length(v_name) > 200 then raise exception 'Recipient name is required'; end if;
  if v_acct is null or char_length(trim(v_acct)) < 3 or char_length(v_acct) > 64 then raise exception 'Recipient account identifier is required'; end if;

  insert into public.transfers (
    user_id, idempotency_key, transfer_type, beneficiary_id, recipient_name, recipient_bank_name,
    recipient_account_number, recipient_routing_code, source_country, source_currency,
    destination_country, destination_currency, source_amount, purpose, description,
    estimated_processing_time, provider_id, provider_code, is_demo)
  values (
    v_uid, p_idempotency_key, p_transfer_type, p_beneficiary_id, trim(v_name), v_bank,
    trim(v_acct), v_route, upper(p_source_country), upper(p_source_currency),
    upper(p_destination_country), upper(p_destination_currency), p_source_amount, p_purpose, p_description,
    v_corridor.estimated_processing_time, v_provider.id, v_provider.code, v_mode = 'demo')
  returning * into v_row;

  -- RISK HOOKS: flag for manual compliance review; confirm_transfer refuses while a review is open
  if v_per_max is not null and p_source_amount >= v_per_max * 0.8 then
    insert into public.risk_reviews (user_id, transfer_id, reason, severity)
    values (v_uid, v_row.id, 'Amount is at least 80% of the per-transfer limit', 'medium');
  end if;
  select count(*) into v_bad from public.transfers
   where user_id = v_uid and id <> v_row.id and status in ('failed','cancelled','refunded')
     and created_at > now() - interval '1 day';
  if v_bad >= 3 then
    insert into public.risk_reviews (user_id, transfer_id, reason, severity)
    values (v_uid, v_row.id, 'Three or more failed or cancelled transfers in 24 hours', 'high');
  end if;
  return v_row;
end; $$;

create or replace function public.confirm_transfer(p_transfer_id uuid)
returns public.transfers language plpgsql security definer set search_path = '' as $$
declare v_row public.transfers;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from public.transfers where id = p_transfer_id and user_id = auth.uid() for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_row.status <> 'draft' then raise exception 'Only draft transfers can be confirmed'; end if;
  if v_row.fee_amount is null or v_row.destination_amount is null then
    raise exception 'A provider quote (fee and recipient amount) is required before confirmation';
  end if;
  if v_row.quote_expires_at is null or v_row.quote_expires_at <= now() then
    raise exception 'The quote has expired. Request a new quote';
  end if;
  if exists (select 1 from public.risk_reviews where transfer_id = p_transfer_id and status = 'open') then
    raise exception 'This transfer is awaiting manual review';
  end if;
  if exists (select 1 from public.risk_reviews where transfer_id = p_transfer_id and status = 'rejected') then
    raise exception 'This transfer was rejected in review';
  end if;
  update public.transfers set status = 'awaiting_payment', confirmed_at = now()
   where id = p_transfer_id returning * into v_row;
  return v_row;
end; $$;

-- =========================================================
-- F. SERVER-ONLY TRANSFER PROCESSING (service_role)
-- =========================================================
create or replace function public.server_apply_quote(
  p_transfer_id uuid, p_fee numeric, p_rate numeric, p_destination_amount numeric,
  p_quote_id text, p_expires_at timestamptz)
returns public.transfers language plpgsql security definer set search_path = '' as $$
declare v_row public.transfers;
begin
  if p_fee is null or p_fee < 0 or p_rate is null or p_rate <= 0 or p_destination_amount is null or p_destination_amount <= 0 then
    raise exception 'Invalid quote values';
  end if;
  if p_expires_at is null or p_expires_at <= now() then raise exception 'Quote expiry must be in the future'; end if;
  select * into v_row from public.transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_row.status <> 'draft' then raise exception 'Only draft transfers can be quoted'; end if;
  update public.transfers set fee_amount = p_fee, exchange_rate = p_rate, destination_amount = p_destination_amount,
         provider_quote_id = p_quote_id, quote_expires_at = p_expires_at
   where id = p_transfer_id returning * into v_row;
  perform public._audit('transfer.quoted', 'transfer', p_transfer_id::text, jsonb_build_object('fee', p_fee, 'rate', p_rate));
  return v_row;
end; $$;

create or replace function public.server_begin_processing(p_transfer_id uuid)
returns public.transfers language plpgsql security definer set search_path = '' as $$
declare v_t public.transfers; v_acct public.accounts;
begin
  select * into v_t from public.transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.status <> 'awaiting_payment' then raise exception 'Transfer is not awaiting payment'; end if;
  if v_t.quote_expires_at is null or v_t.quote_expires_at <= now() then raise exception 'The quote has expired'; end if;
  if exists (select 1 from public.risk_reviews where transfer_id = v_t.id and status in ('open','rejected')) then
    raise exception 'Transfer is held for manual review';
  end if;
  select * into v_acct from public.accounts
   where user_id = v_t.user_id and currency = v_t.source_currency and is_demo = v_t.is_demo;
  if not found then raise exception 'No funding account for this currency'; end if;
  -- debit amount + fee; idempotent through the ledger reference
  perform public.post_ledger_entry(v_acct.id, 'debit', v_t.source_amount + v_t.fee_amount,
    'Transfer ' || v_t.reference, 'TRF-DEBIT-' || v_t.reference, v_t.id, null);
  update public.transfers set status = 'processing' where id = v_t.id returning * into v_t;
  perform public._audit('transfer.processing', 'transfer', v_t.id::text, '{}'::jsonb);
  return v_t;
end; $$;

create or replace function public.server_record_provider_submission(p_transfer_id uuid, p_provider_reference text)
returns public.transfers language plpgsql security definer set search_path = '' as $$
declare v_t public.transfers;
begin
  if p_provider_reference is null or char_length(trim(p_provider_reference)) = 0 then raise exception 'Provider reference required'; end if;
  select * into v_t from public.transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.is_demo then raise exception 'Demo transfers cannot be submitted to a provider'; end if;
  if v_t.status <> 'processing' then raise exception 'Transfer is not processing'; end if;
  if v_t.provider_reference is not null and v_t.provider_reference <> p_provider_reference then
    raise exception 'Transfer already has a different provider reference';
  end if;
  update public.transfers set provider_reference = p_provider_reference where id = p_transfer_id returning * into v_t;
  perform public._audit('transfer.submitted_to_provider', 'transfer', p_transfer_id::text, jsonb_build_object('provider', v_t.provider_code));
  return v_t;
end; $$;

-- internal: mark failed, then return funds through the ledger (idempotent). If the refund cannot post, keep 'failed' and raise a risk review.
create or replace function public._fail_and_refund(p_transfer_id uuid, p_reason text)
returns public.transfers language plpgsql security definer set search_path = '' as $$
declare v_t public.transfers; v_acct public.accounts;
begin
  select * into v_t from public.transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.status in ('failed','refunded') then return v_t; end if;
  if v_t.status <> 'processing' then raise exception 'Only processing transfers can fail'; end if;
  update public.transfers set status = 'failed', failure_reason = left(coalesce(p_reason, 'Transfer failed'), 500)
   where id = p_transfer_id returning * into v_t;
  begin
    select * into v_acct from public.accounts
     where user_id = v_t.user_id and currency = v_t.source_currency and is_demo = v_t.is_demo;
    perform public.post_ledger_entry(v_acct.id, 'credit', v_t.source_amount + v_t.fee_amount,
      'Refund for transfer ' || v_t.reference, 'TRF-REFUND-' || v_t.reference, v_t.id, null);
    update public.transfers set status = 'refunded' where id = p_transfer_id returning * into v_t;
  exception when others then
    insert into public.risk_reviews (user_id, transfer_id, reason, severity)
    values (v_t.user_id, v_t.id, 'Refund for failed transfer could not be posted automatically', 'high');
  end;
  return v_t;
end; $$;
revoke all on function public._fail_and_refund(uuid,text) from public, anon, authenticated;

-- authoritative provider outcome (called only after the provider's webhook/poll is verified server-side)
create or replace function public.server_apply_provider_status(
  p_transfer_id uuid, p_status text, p_reason text default null, p_provider_reference text default null)
returns public.transfers language plpgsql security definer set search_path = '' as $$
declare v_t public.transfers;
begin
  if p_status not in ('processing','completed','failed') then raise exception 'Unknown provider status'; end if;
  select * into v_t from public.transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.is_demo then raise exception 'Demo transfers never use provider confirmation'; end if;
  if p_provider_reference is not null and v_t.provider_reference is not null and v_t.provider_reference <> p_provider_reference then
    raise exception 'Provider reference mismatch';
  end if;

  if p_status = 'processing' then return v_t; end if;

  if p_status = 'completed' then
    if v_t.status = 'completed' then return v_t; end if;           -- duplicate event
    if v_t.status <> 'processing' then                              -- out-of-order / conflicting event
      perform public._audit('transfer.provider_status_conflict', 'transfer', p_transfer_id::text,
        jsonb_build_object('current', v_t.status, 'incoming', p_status));
      raise exception 'Cannot complete a transfer in status %', v_t.status;
    end if;
    if v_t.provider_reference is null then
      if p_provider_reference is null then raise exception 'Provider reference required to complete'; end if;
      update public.transfers set provider_reference = p_provider_reference where id = p_transfer_id;
    end if;
    update public.transfers set status = 'completed', confirmed_at = coalesce(confirmed_at, now())
     where id = p_transfer_id returning * into v_t;
    perform public._audit('transfer.completed', 'transfer', p_transfer_id::text, jsonb_build_object('provider', v_t.provider_code));
    return v_t;
  end if;

  -- failed
  if v_t.status in ('failed','refunded') then return v_t; end if;
  if v_t.status = 'completed' then
    perform public._audit('transfer.provider_status_conflict', 'transfer', p_transfer_id::text,
      jsonb_build_object('current', v_t.status, 'incoming', p_status));
    insert into public.risk_reviews (user_id, transfer_id, reason, severity)
    values (v_t.user_id, v_t.id, 'Provider reported failure after completion', 'high');
    return v_t;
  end if;
  v_t := public._fail_and_refund(p_transfer_id, p_reason);
  perform public._audit('transfer.failed', 'transfer', p_transfer_id::text, jsonb_build_object('reason', p_reason));
  return v_t;
end; $$;

-- reconciliation helper: transfers stuck in processing
create or replace function public.stale_processing_transfers(p_minutes integer default 30)
returns table (transfer_id uuid, reference text, provider_code text, provider_reference text, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' and not public.has_staff_role(array['finance']) then
    raise exception 'Forbidden';
  end if;
  return query select t.id, t.reference, t.provider_code, t.provider_reference, t.updated_at
    from public.transfers t
   where t.status = 'processing' and not t.is_demo and t.updated_at < now() - make_interval(mins => greatest(p_minutes, 1))
   order by t.updated_at;
end; $$;

-- webhook intake (dedupe) and incoming payments
create or replace function public.server_record_webhook_event(
  p_provider_code text, p_event_id text, p_event_type text, p_payload jsonb, p_signature_verified boolean)
returns table (event_row_id uuid, is_duplicate boolean)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.webhook_events (provider_code, event_id, event_type, payload, signature_verified)
  values (p_provider_code, p_event_id, p_event_type, p_payload, coalesce(p_signature_verified, false))
  on conflict (provider_code, event_id) do nothing returning id into v_id;
  if v_id is null then
    select w.id into v_id from public.webhook_events w where w.provider_code = p_provider_code and w.event_id = p_event_id;
    return query select v_id, true;
  end if;
  return query select v_id, false;
end; $$;

create or replace function public.server_mark_webhook_processed(p_event_row_id uuid, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.webhook_events
     set processed_at = case when p_error is null then now() else processed_at end,
         processing_error = left(p_error, 500)
   where id = p_event_row_id;
$$;

create or replace function public.server_process_incoming_payment(
  p_provider_code text, p_provider_reference text, p_receiving_account_ref text,
  p_amount numeric, p_currency text, p_sender_name text default null,
  p_sender_details jsonb default '{}'::jsonb, p_fee numeric default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_va public.virtual_accounts; v_acct public.accounts; v_id uuid;
begin
  if public.current_app_mode() <> 'production' then raise exception 'Provider payments are only processed in production mode'; end if;
  if p_provider_code is null or p_provider_code = 'demo' then raise exception 'Invalid provider'; end if;
  if p_provider_reference is null or char_length(p_provider_reference) = 0 then raise exception 'Provider reference required'; end if;

  select id into v_id from public.incoming_payments where provider_code = p_provider_code and provider_reference = p_provider_reference;
  if found then perform public.confirm_incoming_payment(v_id); return v_id; end if;

  select * into v_va from public.virtual_accounts
   where provider_code = p_provider_code and provider_reference = p_receiving_account_ref and status = 'active';
  if not found then raise exception 'Unknown receiving account'; end if;
  if p_amount is null or p_amount <= 0 or coalesce(p_fee, 0) < 0 or coalesce(p_fee, 0) >= p_amount then raise exception 'Invalid amount'; end if;
  if upper(p_currency) <> v_va.currency then raise exception 'Currency does not match the receiving account'; end if;
  select * into v_acct from public.accounts
   where user_id = v_va.user_id and currency = v_va.currency and is_demo = false and status = 'active';
  if not found then raise exception 'No active account for this currency'; end if;

  insert into public.incoming_payments (user_id, account_id, virtual_account_id, method, sender_name, sender_details,
                                        amount, currency, fee_amount, provider_code, provider_reference)
  values (v_va.user_id, v_acct.id, v_va.id, 'virtual_account', p_sender_name, coalesce(p_sender_details, '{}'::jsonb),
          p_amount, v_va.currency, coalesce(p_fee, 0), p_provider_code, p_provider_reference)
  on conflict (provider_code, provider_reference) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.incoming_payments where provider_code = p_provider_code and provider_reference = p_provider_reference;
  end if;
  perform public.confirm_incoming_payment(v_id);
  perform public._audit('incoming_payment.confirmed', 'incoming_payment', v_id::text, jsonb_build_object('provider', p_provider_code));
  return v_id;
end; $$;

-- =========================================================
-- G. DEMO FUNCTIONS (authenticated; only in demo mode, only demo accounts/transfers)
-- =========================================================
create or replace function public._require_demo() returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if public.current_app_mode() <> 'demo' then raise exception 'Demonstration features are disabled in production'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and demo_mode) then raise exception 'Demo mode is not enabled for this profile'; end if;
  return auth.uid();
end; $$;
revoke all on function public._require_demo() from public, anon, authenticated;

create or replace function public.demo_complete_verification() returns public.customer_verifications
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_demo(); v_row public.customer_verifications;
begin
  update public.customer_verifications set status = 'verified', provider_code = 'demo', reviewed_at = now(),
         legal_name = coalesce(legal_name, 'Demo Customer')
   where user_id = v_uid and status in ('not_started','pending') returning * into v_row;
  if not found then raise exception 'Verification cannot be simulated in its current state'; end if;
  return v_row;
end; $$;

create or replace function public.demo_add_funds(p_currency text, p_amount numeric) returns public.accounts
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_demo(); v_acct public.accounts;
begin
  if p_currency is null or char_length(p_currency) <> 3 then raise exception 'Invalid currency'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 or p_amount <> round(p_amount, 2) then raise exception 'Demo funding must be between 1 and 1,000,000'; end if;
  insert into public.accounts (user_id, currency, is_demo, provider_code)
  values (v_uid, upper(p_currency), true, 'demo') on conflict (user_id, currency, is_demo) do nothing;
  select * into v_acct from public.accounts where user_id = v_uid and currency = upper(p_currency) and is_demo for update;
  if v_acct.balance + p_amount > 10000000 then raise exception 'Demo balance limit reached'; end if;
  perform public.post_ledger_entry(v_acct.id, 'credit', p_amount, 'DEMO funds (simulated)', 'DEMO-FUND-' || gen_random_uuid()::text, null, null);
  select * into v_acct from public.accounts where id = v_acct.id;
  return v_acct;
end; $$;

create or replace function public.demo_quote_transfer(p_transfer_id uuid) returns public.transfers
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_demo(); v_t public.transfers; v_rate numeric; v_fee numeric;
begin
  select * into v_t from public.transfers where id = p_transfer_id and user_id = v_uid and is_demo for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.status <> 'draft' then raise exception 'Only draft transfers can be quoted'; end if;
  -- illustrative, clearly simulated rates
  v_rate := case v_t.destination_currency when 'GBP' then 0.00052 when 'USD' then 0.00065 else null end;
  if v_rate is null then raise exception 'No demo rate for this currency'; end if;
  v_fee := round(v_t.source_amount * 0.01, 2);
  update public.transfers set fee_amount = v_fee, exchange_rate = v_rate,
         destination_amount = round(v_t.source_amount * v_rate, 2),
         provider_quote_id = 'DEMO-QUOTE-' || gen_random_uuid()::text,
         quote_expires_at = now() + interval '10 minutes'
   where id = p_transfer_id returning * into v_t;
  if v_t.destination_amount <= 0 then raise exception 'Amount too small to convert'; end if;
  return v_t;
end; $$;

create or replace function public.demo_submit_transfer(p_transfer_id uuid) returns public.transfers
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_demo(); v_t public.transfers;
begin
  select * into v_t from public.transfers where id = p_transfer_id and user_id = v_uid and is_demo;
  if not found then raise exception 'Transfer not found'; end if;
  return public.server_begin_processing(p_transfer_id);
end; $$;

create or replace function public.demo_settle_transfer(p_transfer_id uuid, p_outcome text) returns public.transfers
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := public._require_demo(); v_t public.transfers;
begin
  if p_outcome not in ('completed','failed') then raise exception 'Invalid outcome'; end if;
  select * into v_t from public.transfers where id = p_transfer_id and user_id = v_uid and is_demo for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_t.status <> 'processing' then raise exception 'Transfer is not processing'; end if;
  if p_outcome = 'failed' then return public._fail_and_refund(p_transfer_id, 'Simulated failure (demo)'); end if;
  update public.transfers set provider_reference = 'DEMO-' || v_t.reference where id = p_transfer_id;
  update public.transfers set status = 'completed' where id = p_transfer_id returning * into v_t;
  return v_t;
end; $$;

-- =========================================================
-- H. STAFF ACTIONS (authenticated; role checked inside; every action audited)
-- =========================================================
create or replace function public.staff_review_verification(p_user_id uuid, p_decision text, p_reason text default null)
returns public.customer_verifications language plpgsql security definer set search_path = '' as $$
declare v_row public.customer_verifications; v_new text;
begin
  if not public.has_staff_role(array['compliance']) then raise exception 'Forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'Staff cannot review their own verification'; end if;
  v_new := case p_decision when 'approve' then 'verified' when 'reject' then 'rejected' when 'request_info' then 'additional_info_required' end;
  if v_new is null then raise exception 'Invalid decision'; end if;
  if p_decision <> 'approve' and (p_reason is null or char_length(trim(p_reason)) = 0) then raise exception 'A reason is required'; end if;
  update public.customer_verifications
     set status = v_new, reviewed_at = now(), provider_code = 'manual_review',
         rejection_reason = case when v_new = 'verified' then null else left(p_reason, 500) end
   where user_id = p_user_id and status = 'pending' returning * into v_row;
  if not found then raise exception 'Only pending verifications can be reviewed'; end if;
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, 'verification', case v_new when 'verified' then 'Identity verified' when 'rejected' then 'Verification rejected' else 'More information needed' end,
          case when v_new = 'verified' then null else left(p_reason, 500) end, '/verification');
  perform public._audit('verification.' || p_decision, 'customer_verification', p_user_id::text, '{}'::jsonb);
  return v_row;
end; $$;

create or replace function public.staff_resolve_risk_review(p_id uuid, p_decision text, p_notes text default null)
returns public.risk_reviews language plpgsql security definer set search_path = '' as $$
declare v_r public.risk_reviews;
begin
  if not public.has_staff_role(array['compliance']) then raise exception 'Forbidden'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Invalid decision'; end if;
  if p_notes is null or char_length(trim(p_notes)) = 0 then raise exception 'Review notes are required'; end if;
  select * into v_r from public.risk_reviews where id = p_id for update;
  if not found then raise exception 'Review not found'; end if;
  if v_r.status <> 'open' then raise exception 'Review is already resolved'; end if;
  if v_r.user_id = auth.uid() then raise exception 'Staff cannot resolve a review about themselves'; end if;
  update public.risk_reviews
     set status = case p_decision when 'approve' then 'approved' else 'rejected' end,
         reviewer_id = auth.uid(), notes = left(p_notes, 1000), resolved_at = now()
   where id = p_id returning * into v_r;
  if p_decision = 'reject' and v_r.transfer_id is not null then
    update public.transfers set status = 'cancelled', failure_reason = 'Rejected in compliance review'
     where id = v_r.transfer_id and status in ('draft','awaiting_payment');
  end if;
  perform public._audit('risk_review.' || p_decision, 'risk_review', p_id::text, jsonb_build_object('transfer_id', v_r.transfer_id));
  return v_r;
end; $$;

create or replace function public.staff_set_account_status(p_account_id uuid, p_status text, p_reason text)
returns public.accounts language plpgsql security definer set search_path = '' as $$
declare v_a public.accounts;
begin
  if not public.has_staff_role(array['compliance']) then raise exception 'Forbidden'; end if;
  if p_status not in ('active','frozen') then raise exception 'Invalid status'; end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 then raise exception 'A reason is required'; end if;
  update public.accounts set status = p_status where id = p_account_id and status <> 'closed' returning * into v_a;
  if not found then raise exception 'Account not found or closed'; end if;
  perform public._audit('account.' || p_status, 'account', p_account_id::text, jsonb_build_object('reason', left(p_reason, 500)));
  return v_a;
end; $$;

create or replace function public.staff_set_setting(p_key text, p_value jsonb)
returns public.app_settings language plpgsql security definer set search_path = '' as $$
declare v_row public.app_settings;
begin
  if not public.has_staff_role(array['admin']) then raise exception 'Forbidden'; end if;
  if p_key not in ('app_mode','feature_international_transfers','feature_receiving') then raise exception 'Unknown setting'; end if;
  if p_key = 'app_mode' then
    if p_value not in ('"demo"'::jsonb, '"production"'::jsonb) then raise exception 'Invalid app mode'; end if;
    if exists (select 1 from public.transfers where is_demo and status in ('awaiting_payment','processing','under_review')) then
      raise exception 'Cannot change mode while demo transfers are in flight';
    end if;
  elsif jsonb_typeof(p_value) <> 'boolean' then
    raise exception 'This setting must be true or false';
  end if;
  insert into public.app_settings (key, value, updated_by, updated_at) values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_row;
  perform public._audit('setting.changed', 'app_setting', p_key, jsonb_build_object('value', p_value));
  return v_row;
end; $$;

create or replace function public.staff_grant_role(p_user_id uuid, p_role text)
returns public.staff_roles language plpgsql security definer set search_path = '' as $$
declare v_row public.staff_roles;
begin
  if not public.has_staff_role(array['admin']) then raise exception 'Forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if p_role not in ('support','compliance','finance','admin') then raise exception 'Invalid role'; end if;
  if not exists (select 1 from auth.users where id = p_user_id and email_confirmed_at is not null) then
    raise exception 'User not found or email not verified';
  end if;
  insert into public.staff_roles (user_id, role, granted_by) values (p_user_id, p_role, auth.uid())
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by
  returning * into v_row;
  perform public._audit('staff_role.granted', 'user', p_user_id::text, jsonb_build_object('role', p_role));
  return v_row;
end; $$;

create or replace function public.staff_revoke_role(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_staff_role(array['admin']) then raise exception 'Forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  delete from public.staff_roles where user_id = p_user_id;
  if not exists (select 1 from public.staff_roles where role = 'admin') then
    raise exception 'At least one admin must remain';
  end if;
  perform public._audit('staff_role.revoked', 'user', p_user_id::text, '{}'::jsonb);
end; $$;

-- =========================================================
-- I. PRIVILEGES
-- =========================================================
revoke all on function
  public.server_apply_quote(uuid,numeric,numeric,numeric,text,timestamptz),
  public.server_begin_processing(uuid),
  public.server_record_provider_submission(uuid,text),
  public.server_apply_provider_status(uuid,text,text,text),
  public.server_record_webhook_event(text,text,text,jsonb,boolean),
  public.server_mark_webhook_processed(uuid,text),
  public.server_process_incoming_payment(text,text,text,numeric,text,text,jsonb,numeric)
  from public, anon, authenticated;
grant execute on function
  public.server_apply_quote(uuid,numeric,numeric,numeric,text,timestamptz),
  public.server_begin_processing(uuid),
  public.server_record_provider_submission(uuid,text),
  public.server_apply_provider_status(uuid,text,text,text),
  public.server_record_webhook_event(text,text,text,jsonb,boolean),
  public.server_mark_webhook_processed(uuid,text),
  public.server_process_incoming_payment(text,text,text,numeric,text,text,jsonb,numeric)
  to service_role;

revoke all on function public.stale_processing_transfers(integer) from public, anon;
grant execute on function public.stale_processing_transfers(integer) to authenticated, service_role;

revoke all on function
  public.demo_complete_verification(), public.demo_add_funds(text,numeric), public.demo_quote_transfer(uuid),
  public.demo_submit_transfer(uuid), public.demo_settle_transfer(uuid,text),
  public.staff_review_verification(uuid,text,text), public.staff_resolve_risk_review(uuid,text,text),
  public.staff_set_account_status(uuid,text,text), public.staff_set_setting(text,jsonb),
  public.staff_grant_role(uuid,text), public.staff_revoke_role(uuid)
  from public, anon;
grant execute on function
  public.demo_complete_verification(), public.demo_add_funds(text,numeric), public.demo_quote_transfer(uuid),
  public.demo_submit_transfer(uuid), public.demo_settle_transfer(uuid,text),
  public.staff_review_verification(uuid,text,text), public.staff_resolve_risk_review(uuid,text,text),
  public.staff_set_account_status(uuid,text,text), public.staff_set_setting(text,jsonb),
  public.staff_grant_role(uuid,text), public.staff_revoke_role(uuid)
  to authenticated;

-- create_transfer / confirm_transfer keep their existing grants (create or replace preserves them)
