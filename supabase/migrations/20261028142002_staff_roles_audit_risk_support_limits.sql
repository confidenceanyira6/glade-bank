-- STAFF ROLES (customers have no row; only service role can grant)
create table public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('support','compliance','finance','admin')),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.staff_roles enable row level security;
create policy staff_roles_select_own on public.staff_roles for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.staff_roles from anon, authenticated;
grant select on public.staff_roles to authenticated;

create or replace function public.has_staff_role(p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_roles s where s.user_id = (select auth.uid()) and (s.role = any(p_roles) or s.role = 'admin'));
$$;
revoke all on function public.has_staff_role(text[]) from public, anon;
grant execute on function public.has_staff_role(text[]) to authenticated;

-- AUDIT LOG (append-only)
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
alter table public.audit_logs enable row level security;
create policy audit_logs_staff_select on public.audit_logs for select to authenticated
  using (public.has_staff_role(array['compliance','finance']));
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create or replace function public.block_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception '% on % is not allowed: records are append-only', tg_op, tg_table_name; end; $$;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.block_mutation();
-- Posted ledger entries are immutable; corrections must be new reversing entries
create trigger ledger_entries_immutable before update or delete on public.ledger_entries
  for each row execute function public.block_mutation();

-- RISK REVIEWS
create table public.risk_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transfer_id uuid references public.transfers(id) on delete set null,
  reason text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','approved','rejected')),
  reviewer_id uuid references auth.users(id),
  notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index risk_reviews_status_idx on public.risk_reviews (status, created_at desc);
create index risk_reviews_user_idx on public.risk_reviews (user_id);
alter table public.risk_reviews enable row level security;
create policy risk_reviews_staff_select on public.risk_reviews for select to authenticated
  using (public.has_staff_role(array['compliance']));
revoke all on public.risk_reviews from anon, authenticated;
grant select on public.risk_reviews to authenticated;

-- TRANSACTION LIMITS (configurable; enforcement wired in create_transfer in a later step)
create table public.transaction_limits (
  id uuid primary key default gen_random_uuid(),
  country char(2),
  currency char(3),
  verification_status text not null default 'verified' check (verification_status in ('not_started','pending','verified')),
  per_transfer_max numeric(18,2) check (per_transfer_max is null or per_transfer_max > 0),
  daily_max numeric(18,2) check (daily_max is null or daily_max > 0),
  monthly_max numeric(18,2) check (monthly_max is null or monthly_max > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, currency, verification_status)
);
create trigger transaction_limits_updated_at before update on public.transaction_limits
  for each row execute function public.set_updated_at();
alter table public.transaction_limits enable row level security;
create policy transaction_limits_staff_select on public.transaction_limits for select to authenticated
  using (public.has_staff_role(array['compliance','finance']));
revoke all on public.transaction_limits from anon, authenticated;
grant select on public.transaction_limits to authenticated;

-- APP SETTINGS / FEATURE FLAGS
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
create policy app_settings_staff_select on public.app_settings for select to authenticated
  using (public.has_staff_role(array['support','compliance','finance']));
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
insert into public.app_settings (key, value) values
  ('app_mode', '"demo"'::jsonb),
  ('feature_international_transfers', 'false'::jsonb),
  ('feature_receiving', 'false'::jsonb);

-- SUPPORT: replies + staff access
create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  is_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index support_ticket_messages_ticket_idx on public.support_ticket_messages (ticket_id, created_at);
alter table public.support_ticket_messages enable row level security;
create policy stm_select_own on public.support_ticket_messages for select to authenticated
  using (exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid())));
create policy stm_insert_own on public.support_ticket_messages for insert to authenticated
  with check (author_id = (select auth.uid()) and is_staff = false
    and exists (select 1 from public.support_tickets t where t.id = ticket_id and t.user_id = (select auth.uid()) and t.status <> 'closed'));
create policy stm_staff_select on public.support_ticket_messages for select to authenticated
  using (public.has_staff_role(array['support']));
create policy stm_staff_insert on public.support_ticket_messages for insert to authenticated
  with check (author_id = (select auth.uid()) and is_staff = true and public.has_staff_role(array['support']));
revoke all on public.support_ticket_messages from anon, authenticated;
grant select, insert on public.support_ticket_messages to authenticated;

create policy tickets_staff_select on public.support_tickets for select to authenticated
  using (public.has_staff_role(array['support']));
create policy tickets_staff_update on public.support_tickets for update to authenticated
  using (public.has_staff_role(array['support'])) with check (public.has_staff_role(array['support']));
grant update (status) on public.support_tickets to authenticated;

-- customers cannot choose their own ticket status
create or replace function public.force_ticket_open() returns trigger
language plpgsql set search_path = '' as $$
begin new.status := 'open'; return new; end; $$;
create trigger support_tickets_force_open before insert on public.support_tickets
  for each row execute function public.force_ticket_open();

-- STAFF READ ACCESS (least privilege per role)
create policy transfers_staff_select on public.transfers for select to authenticated
  using (public.has_staff_role(array['support','compliance','finance']));
create policy incoming_staff_select on public.incoming_payments for select to authenticated
  using (public.has_staff_role(array['finance','compliance']));
create policy webhook_events_staff_select on public.webhook_events for select to authenticated
  using (public.has_staff_role(array['finance']));
grant select on public.webhook_events to authenticated;
create policy verifications_staff_select on public.customer_verifications for select to authenticated
  using (public.has_staff_role(array['compliance']));
create policy profiles_staff_select on public.profiles for select to authenticated
  using (public.has_staff_role(array['support','compliance']));

-- TIGHTEN EXISTING GRANTS
revoke insert, delete on public.profiles from authenticated;
-- beneficiaries may only point glade_user_id at themselves-or-null is not enforceable via RLS; remove client control
revoke insert (glade_user_id), update (glade_user_id) on public.beneficiaries from authenticated;

-- DEMO ISOLATION: a demo account can never carry a real provider reference
alter table public.accounts add constraint accounts_demo_no_provider_ref
  check (not (is_demo and provider_account_reference is not null));

-- NOTIFICATION DELIVERY TRACKING (never claim an email was sent unless a provider accepted it)
alter table public.notifications
  add column email_status text not null default 'not_sent' check (email_status in ('not_sent','not_configured','queued','accepted','failed')),
  add column email_provider_message_id text,
  add column email_updated_at timestamptz;

-- RECONCILIATION: accounts whose stored balance differs from the latest ledger entry
create or replace function public.reconcile_account_balances()
returns table (account_id uuid, stored_balance numeric, ledger_balance numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_staff_role(array['finance']) then raise exception 'Forbidden'; end if;
  return query
  select a.id, a.balance, coalesce((select l.balance_after from public.ledger_entries l where l.account_id = a.id order by l.created_at desc, l.id desc limit 1), 0)
  from public.accounts a
  where a.balance <> coalesce((select l.balance_after from public.ledger_entries l where l.account_id = a.id order by l.created_at desc, l.id desc limit 1), 0);
end; $$;
revoke all on function public.reconcile_account_balances() from public, anon;
grant execute on function public.reconcile_account_balances() to authenticated;
