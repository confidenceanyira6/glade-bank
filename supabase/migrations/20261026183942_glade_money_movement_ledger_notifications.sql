-- Create a verification row at sign-up (replaces earlier trigger function body)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email, phone, country_of_residence)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.phone, new.raw_user_meta_data->>'phone'),
    upper(nullif(new.raw_user_meta_data->>'country_of_residence', ''))
  );
  insert into public.customer_verifications (user_id, status, country_of_residence)
  values (new.id, 'not_started', upper(nullif(new.raw_user_meta_data->>'country_of_residence', '')));
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ACCOUNTS / WALLETS (only real when a provider account exists; is_demo labels demo mode)
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  currency char(3) not null,
  balance numeric(18,2) not null default 0 check (balance >= 0),
  is_demo boolean not null default false,
  provider_code text,
  provider_account_reference text,
  status text not null default 'active' check (status in ('active','frozen','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, currency, is_demo)
);
create trigger accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- TRANSFERS
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('GB' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  transfer_type text not null check (transfer_type in ('international','local')),
  status text not null default 'draft'
    check (status in ('draft','awaiting_payment','processing','completed','failed','cancelled','refunded','under_review')),
  beneficiary_id uuid references public.beneficiaries(id) on delete set null,
  recipient_name text not null,
  recipient_bank_name text,
  recipient_account_number text not null,
  recipient_routing_code text,
  source_country char(2) not null,
  source_currency char(3) not null,
  destination_country char(2) not null,
  destination_currency char(3) not null,
  source_amount numeric(18,2) not null check (source_amount > 0),
  fee_amount numeric(18,2) check (fee_amount is null or fee_amount >= 0),
  exchange_rate numeric(24,10) check (exchange_rate is null or exchange_rate > 0),
  destination_amount numeric(18,2) check (destination_amount is null or destination_amount > 0),
  purpose text,
  description text,
  estimated_processing_time text,
  provider_id uuid references public.payment_providers(id) on delete set null,
  provider_code text,
  provider_quote_id text,
  provider_reference text,
  failure_reason text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create unique index transfers_provider_ref_uidx on public.transfers (provider_code, provider_reference) where provider_reference is not null;
create index transfers_user_created_idx on public.transfers (user_id, created_at desc);
create index transfers_status_idx on public.transfers (status);
create index transfers_beneficiary_idx on public.transfers (beneficiary_id);
create index transfers_provider_idx on public.transfers (provider_id);
create trigger transfers_updated_at before update on public.transfers
  for each row execute function public.set_updated_at();

create table public.transfer_status_history (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.transfers(id) on delete cascade,
  from_status text,
  to_status text not null,
  note text,
  created_at timestamptz not null default now()
);
create index transfer_status_history_transfer_idx on public.transfer_status_history (transfer_id, created_at);

-- LEDGER
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete restrict,
  direction text not null check (direction in ('credit','debit')),
  amount numeric(18,2) not null check (amount > 0),
  balance_after numeric(18,2) not null,
  description text,
  transfer_id uuid references public.transfers(id) on delete set null,
  incoming_payment_id uuid,
  provider_reference text,
  created_at timestamptz not null default now()
);
create unique index ledger_idempotency_uidx on public.ledger_entries (account_id, direction, provider_reference) where provider_reference is not null;
create index ledger_account_idx on public.ledger_entries (account_id, created_at desc);
create index ledger_transfer_idx on public.ledger_entries (transfer_id);

-- VIRTUAL ACCOUNTS (details returned by the provider only; never fabricated)
create table public.virtual_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_code text not null,
  currency char(3) not null,
  country char(2),
  account_name text not null,
  account_number text not null,
  bank_name text,
  routing_code text,
  provider_reference text not null,
  status text not null default 'active' check (status in ('active','disabled','closed')),
  created_at timestamptz not null default now(),
  unique (provider_code, provider_reference)
);
create index virtual_accounts_user_idx on public.virtual_accounts (user_id);

-- PAYMENT LINKS (created server-side via a supporting provider)
create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique,
  amount numeric(18,2) check (amount is null or amount > 0),
  currency char(3) not null,
  description text,
  status text not null default 'active' check (status in ('active','expired','disabled')),
  provider_code text not null,
  provider_reference text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index payment_links_user_idx on public.payment_links (user_id);

-- INCOMING PAYMENTS (credited only after provider confirmation)
create table public.incoming_payments (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('GBR' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
  user_id uuid not null references auth.users(id) on delete restrict,
  account_id uuid references public.accounts(id) on delete restrict,
  virtual_account_id uuid references public.virtual_accounts(id) on delete set null,
  payment_link_id uuid references public.payment_links(id) on delete set null,
  method text not null check (method in ('bank_transfer','virtual_account','cross_border_payout','glade_user','payment_link')),
  sender_name text,
  sender_details jsonb not null default '{}'::jsonb,
  amount numeric(18,2) not null check (amount > 0),
  currency char(3) not null,
  fee_amount numeric(18,2) not null default 0 check (fee_amount >= 0),
  exchange_rate numeric(24,10),
  provider_code text not null,
  provider_reference text not null,
  status text not null default 'pending' check (status in ('pending','confirmed','failed')),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider_code, provider_reference)
);
create index incoming_payments_user_idx on public.incoming_payments (user_id, created_at desc);
create index incoming_payments_account_idx on public.incoming_payments (account_id);
create index incoming_payments_va_idx on public.incoming_payments (virtual_account_id);
create index incoming_payments_link_idx on public.incoming_payments (payment_link_id);

alter table public.ledger_entries
  add constraint ledger_entries_incoming_fk foreign key (incoming_payment_id)
  references public.incoming_payments(id) on delete set null;
create index ledger_incoming_idx on public.ledger_entries (incoming_payment_id);

-- WEBHOOK EVENTS (server only; dedupes provider callbacks)
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  event_id text not null,
  event_type text,
  payload jsonb not null,
  signature_verified boolean not null default false,
  processed_at timestamptz,
  processing_error text,
  received_at timestamptz not null default now(),
  unique (provider_code, event_id)
);

-- NOTIFICATIONS, SUPPORT, EXCHANGE RATES
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transfer_id uuid references public.transfers(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 200),
  message text not null check (char_length(message) between 3 and 5000),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index support_tickets_transfer_idx on public.support_tickets (transfer_id);
create trigger support_tickets_updated_at before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency char(3) not null,
  quote_currency char(3) not null,
  rate numeric(24,10) not null check (rate > 0),
  source text not null,
  fetched_at timestamptz not null default now(),
  unique (base_currency, quote_currency)
);

-- TRANSFER STATUS RULES (enforced for every caller)
create or replace function public.enforce_transfer_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
       new.user_id is distinct from old.user_id
    or new.source_amount is distinct from old.source_amount
    or new.fee_amount is distinct from old.fee_amount
    or new.exchange_rate is distinct from old.exchange_rate
    or new.destination_amount is distinct from old.destination_amount
    or new.recipient_account_number is distinct from old.recipient_account_number
    or new.source_currency is distinct from old.source_currency
    or new.destination_currency is distinct from old.destination_currency
  ) then
    raise exception 'Transfer financial details cannot change after confirmation';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('awaiting_payment','cancelled')) or
      (old.status = 'awaiting_payment' and new.status in ('processing','cancelled','failed')) or
      (old.status = 'processing' and new.status in ('completed','failed','under_review')) or
      (old.status = 'under_review' and new.status in ('processing','failed','cancelled','refunded')) or
      (old.status = 'failed' and new.status = 'refunded') or
      (old.status = 'completed' and new.status = 'refunded')
    ) then
      raise exception 'Invalid transfer status change: % -> %', old.status, new.status;
    end if;
    if new.status = 'completed' then
      if new.provider_reference is null then
        raise exception 'A transfer cannot be completed without a provider reference';
      end if;
      new.completed_at = now();
    end if;
  end if;
  return new;
end;
$$;
create trigger transfers_enforce_rules before update on public.transfers
  for each row execute function public.enforce_transfer_rules();

create or replace function public.log_transfer_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if tg_op = 'INSERT' then
    insert into public.transfer_status_history (transfer_id, from_status, to_status)
    values (new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.transfer_status_history (transfer_id, from_status, to_status, note)
    values (new.id, old.status, new.status, new.failure_reason);
    v_title := case new.status
      when 'awaiting_payment' then 'Transfer awaiting payment'
      when 'processing' then 'Transfer is processing'
      when 'completed' then 'Transfer completed'
      when 'failed' then 'Transfer failed'
      when 'cancelled' then 'Transfer cancelled'
      when 'refunded' then 'Transfer refunded'
      when 'under_review' then 'Transfer under review'
      else 'Transfer updated' end;
    insert into public.notifications (user_id, type, title, body, link)
    values (new.user_id, 'transfer_status', v_title,
            'Reference ' || new.reference, '/transfers/' || new.id::text);
  end if;
  return null;
end;
$$;
revoke execute on function public.log_transfer_status() from public, anon, authenticated;
create trigger transfers_log_status after insert or update of status on public.transfers
  for each row execute function public.log_transfer_status();

-- CUSTOMER RPCs (identity always comes from auth.uid())
create or replace function public.submit_verification(
  p_legal_name text, p_date_of_birth date, p_address_line1 text, p_address_line2 text,
  p_city text, p_region text, p_postal_code text, p_country text)
returns public.customer_verifications
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.customer_verifications;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_legal_name is null or char_length(trim(p_legal_name)) < 2 then raise exception 'Legal name is required'; end if;
  if p_date_of_birth is null or p_date_of_birth > (current_date - interval '18 years') then
    raise exception 'You must be at least 18 years old';
  end if;
  if p_country is null or char_length(p_country) <> 2 then raise exception 'A 2-letter country code is required'; end if;

  insert into public.customer_verifications as v
    (user_id, status, legal_name, date_of_birth, address_line1, address_line2, city, region,
     postal_code, country_of_residence, submitted_at)
  values (v_uid, 'pending', trim(p_legal_name), p_date_of_birth, p_address_line1, p_address_line2,
          p_city, p_region, p_postal_code, upper(p_country), now())
  on conflict (user_id) do update set
    status = 'pending',
    legal_name = excluded.legal_name,
    date_of_birth = excluded.date_of_birth,
    address_line1 = excluded.address_line1,
    address_line2 = excluded.address_line2,
    city = excluded.city,
    region = excluded.region,
    postal_code = excluded.postal_code,
    country_of_residence = excluded.country_of_residence,
    submitted_at = now(),
    rejection_reason = null
  where v.status in ('not_started','rejected','additional_info_required')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Verification is already pending or complete';
  end if;
  return v_row;
end;
$$;

create or replace function public.create_transfer(
  p_idempotency_key text, p_transfer_type text,
  p_source_country text, p_source_currency text,
  p_destination_country text, p_destination_currency text,
  p_source_amount numeric,
  p_beneficiary_id uuid default null,
  p_recipient_name text default null, p_recipient_bank_name text default null,
  p_recipient_account_number text default null, p_recipient_routing_code text default null,
  p_purpose text default null, p_description text default null)
returns public.transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.transfers;
  v_corridor public.provider_corridors;
  v_provider public.payment_providers;
  v_ben public.beneficiaries;
  v_name text := p_recipient_name;
  v_bank text := p_recipient_bank_name;
  v_acct text := p_recipient_account_number;
  v_route text := p_recipient_routing_code;
  v_row public.transfers;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'A unique idempotency key is required';
  end if;

  -- Same key from the same user returns the original transfer (prevents double submission)
  select * into v_existing from public.transfers where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then return v_existing; end if;

  if p_transfer_type not in ('international','local') then raise exception 'Invalid transfer type'; end if;
  if p_source_amount is null or p_source_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;

  select c.* into v_corridor
  from public.provider_corridors c
  join public.payment_providers p on p.id = c.provider_id
  where c.is_approved and p.is_enabled
    and c.transfer_type = p_transfer_type
    and c.source_country = upper(p_source_country) and c.source_currency = upper(p_source_currency)
    and c.destination_country = upper(p_destination_country) and c.destination_currency = upper(p_destination_currency)
  order by c.created_at
  limit 1;
  if not found then raise exception 'This transfer route is not currently available'; end if;

  select * into v_provider from public.payment_providers where id = v_corridor.provider_id;

  if v_corridor.requires_verification and not exists (
    select 1 from public.customer_verifications where user_id = v_uid and status = 'verified'
  ) then
    raise exception 'Identity verification is required before sending money';
  end if;

  if p_source_amount < v_corridor.min_amount or (v_corridor.max_amount is not null and p_source_amount > v_corridor.max_amount) then
    raise exception 'Amount is outside the allowed range for this route';
  end if;
  if v_corridor.requires_purpose and (p_purpose is null or char_length(trim(p_purpose)) = 0) then
    raise exception 'Transfer purpose is required for this route';
  end if;

  if p_beneficiary_id is not null then
    select * into v_ben from public.beneficiaries where id = p_beneficiary_id and user_id = v_uid;
    if not found then raise exception 'Beneficiary not found'; end if;
    v_name := v_ben.full_name; v_bank := v_ben.bank_name; v_acct := v_ben.account_number; v_route := v_ben.routing_code;
  end if;
  if v_name is null or char_length(trim(v_name)) < 2 then raise exception 'Recipient name is required'; end if;
  if v_acct is null or char_length(trim(v_acct)) < 3 then raise exception 'Recipient account identifier is required'; end if;

  insert into public.transfers (
    user_id, idempotency_key, transfer_type, beneficiary_id, recipient_name, recipient_bank_name,
    recipient_account_number, recipient_routing_code, source_country, source_currency,
    destination_country, destination_currency, source_amount, purpose, description,
    estimated_processing_time, provider_id, provider_code)
  values (
    v_uid, p_idempotency_key, p_transfer_type, p_beneficiary_id, trim(v_name), v_bank,
    trim(v_acct), v_route, upper(p_source_country), upper(p_source_currency),
    upper(p_destination_country), upper(p_destination_currency), p_source_amount, p_purpose, p_description,
    v_corridor.estimated_processing_time, v_provider.id, v_provider.code)
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.confirm_transfer(p_transfer_id uuid)
returns public.transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.transfers;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from public.transfers where id = p_transfer_id and user_id = auth.uid() for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_row.status <> 'draft' then raise exception 'Only draft transfers can be confirmed'; end if;
  if v_row.fee_amount is null or v_row.destination_amount is null then
    raise exception 'A provider quote (fee and recipient amount) is required before confirmation';
  end if;
  update public.transfers set status = 'awaiting_payment', confirmed_at = now()
  where id = p_transfer_id returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.cancel_transfer(p_transfer_id uuid)
returns public.transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.transfers;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  select * into v_row from public.transfers where id = p_transfer_id and user_id = auth.uid() for update;
  if not found then raise exception 'Transfer not found'; end if;
  if v_row.status not in ('draft','awaiting_payment') then
    raise exception 'This transfer can no longer be cancelled';
  end if;
  update public.transfers set status = 'cancelled' where id = p_transfer_id returning * into v_row;
  return v_row;
end;
$$;

-- SERVER-ONLY RPCs (service_role): ledger posting and confirmed receipts
create or replace function public.post_ledger_entry(
  p_account_id uuid, p_direction text, p_amount numeric, p_description text,
  p_provider_reference text default null, p_transfer_id uuid default null, p_incoming_payment_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(18,2);
  v_new numeric(18,2);
  v_id uuid;
begin
  if p_direction not in ('credit','debit') then raise exception 'Invalid direction'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select balance into v_balance from public.accounts where id = p_account_id and status = 'active' for update;
  if not found then raise exception 'Account not found or not active'; end if;

  if p_provider_reference is not null then
    select id into v_id from public.ledger_entries
    where account_id = p_account_id and direction = p_direction and provider_reference = p_provider_reference;
    if found then return v_id; end if;
  end if;

  v_new := case when p_direction = 'credit' then v_balance + p_amount else v_balance - p_amount end;
  if v_new < 0 then raise exception 'Insufficient funds'; end if;

  update public.accounts set balance = v_new where id = p_account_id;
  insert into public.ledger_entries (account_id, direction, amount, balance_after, description,
                                     transfer_id, incoming_payment_id, provider_reference)
  values (p_account_id, p_direction, p_amount, v_new, p_description,
          p_transfer_id, p_incoming_payment_id, p_provider_reference)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.confirm_incoming_payment(p_incoming_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in public.incoming_payments;
  v_net numeric(18,2);
begin
  select * into v_in from public.incoming_payments where id = p_incoming_payment_id for update;
  if not found then raise exception 'Incoming payment not found'; end if;
  if v_in.status = 'confirmed' then return; end if;
  if v_in.status = 'failed' then raise exception 'Payment already marked failed'; end if;
  if v_in.account_id is null then raise exception 'No account to credit'; end if;

  v_net := v_in.amount - v_in.fee_amount;
  if v_net <= 0 then raise exception 'Net amount must be positive'; end if;

  perform public.post_ledger_entry(v_in.account_id, 'credit', v_net,
    'Incoming payment ' || v_in.reference, v_in.provider_reference, null, v_in.id);

  update public.incoming_payments set status = 'confirmed', received_at = now() where id = v_in.id;

  insert into public.notifications (user_id, type, title, body, link)
  values (v_in.user_id, 'incoming_payment', 'Money received',
          v_in.currency || ' ' || v_net::text || ' received. Reference ' || v_in.reference,
          '/receive/' || v_in.id::text);
end;
$$;

-- ROW LEVEL SECURITY
alter table public.accounts enable row level security;
alter table public.transfers enable row level security;
alter table public.transfer_status_history enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.virtual_accounts enable row level security;
alter table public.payment_links enable row level security;
alter table public.incoming_payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.exchange_rates enable row level security;

create policy "accounts_select_own" on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "transfers_select_own" on public.transfers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "transfer_history_select_own" on public.transfer_status_history
  for select to authenticated using (exists (
    select 1 from public.transfers t where t.id = transfer_id and t.user_id = (select auth.uid())));
create policy "ledger_select_own" on public.ledger_entries
  for select to authenticated using (exists (
    select 1 from public.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
create policy "virtual_accounts_select_own" on public.virtual_accounts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "payment_links_select_own" on public.payment_links
  for select to authenticated using (user_id = (select auth.uid()));
create policy "incoming_select_own" on public.incoming_payments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "tickets_select_own" on public.support_tickets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "tickets_insert_own" on public.support_tickets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "exchange_rates_select_all" on public.exchange_rates
  for select to authenticated using (true);

-- PRIVILEGES: least access
revoke all on all tables in schema public from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke all on public.payment_providers, public.webhook_events from authenticated;
revoke insert, update, delete on public.accounts, public.transfers, public.transfer_status_history,
  public.ledger_entries, public.virtual_accounts, public.payment_links, public.incoming_payments,
  public.exchange_rates, public.customer_verifications, public.provider_corridors, public.notifications
  from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update, delete on public.support_tickets from authenticated;

-- FUNCTION PRIVILEGES
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.enforce_transfer_rules() from public, anon, authenticated;
revoke execute on function public.submit_verification(text,date,text,text,text,text,text,text) from public, anon;
revoke execute on function public.create_transfer(text,text,text,text,text,text,numeric,uuid,text,text,text,text,text,text) from public, anon;
revoke execute on function public.confirm_transfer(uuid) from public, anon;
revoke execute on function public.cancel_transfer(uuid) from public, anon;
grant execute on function public.submit_verification(text,date,text,text,text,text,text,text) to authenticated;
grant execute on function public.create_transfer(text,text,text,text,text,text,numeric,uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.confirm_transfer(uuid) to authenticated;
grant execute on function public.cancel_transfer(uuid) to authenticated;
revoke execute on function public.post_ledger_entry(uuid,text,numeric,text,text,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.confirm_incoming_payment(uuid) from public, anon, authenticated;
grant execute on function public.post_ledger_entry(uuid,text,numeric,text,text,uuid,uuid) to service_role;
grant execute on function public.confirm_incoming_payment(uuid) to service_role;
