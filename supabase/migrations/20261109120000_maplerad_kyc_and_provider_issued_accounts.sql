-- Applied to project gladebank on 2026-11-09.
-- Maplerad customer mapping (no PII, no BVN/NIN stored)
create table if not exists public.provider_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider_code text not null default 'maplerad',
  provider_customer_id text unique,
  tier integer not null default 0 check (tier between 0 and 2),
  status text not null default 'not_started'
    check (status in ('not_started','tier0_created','tier1_submitted','approved','rejected','error')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists provider_customers_updated_at on public.provider_customers;
create trigger provider_customers_updated_at before update on public.provider_customers
  for each row execute function public.set_updated_at();
alter table public.provider_customers enable row level security;
drop policy if exists provider_customers_select_own on public.provider_customers;
create policy provider_customers_select_own on public.provider_customers
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.provider_customers from anon, authenticated;

-- Verified, de-duplicated log of inbound provider webhooks (server only)
create table if not exists public.provider_webhook_log (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  body_sha256 text not null unique,
  event_type text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  process_note text
);
alter table public.provider_webhook_log enable row level security;
revoke all on public.provider_webhook_log from anon, authenticated;

-- Real accounts can only carry a provider-issued number. Random numbers are for demo accounts only.
create or replace function public.accounts_set_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account_number is null then
    if new.is_demo then
      new.account_number := public.gen_account_number();
    else
      raise exception 'Real accounts must be issued by the banking partner after verification';
    end if;
  end if;
  return new;
end;
$$;

-- Only auto-open a local account in demo mode. In production the Edge Function opens it with the Maplerad number.
create or replace function public.open_default_account_on_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified')
     and public.current_app_mode() = 'demo' then
    insert into public.accounts (user_id, currency, is_demo, provider_code)
    values (new.user_id, 'NGN', true, 'demo')
    on conflict (user_id, currency, is_demo) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.open_default_account_on_verified() from public, anon, authenticated;

-- Users can no longer self-open accounts outside demo mode
create or replace function public.open_my_account(p_currency text)
returns public.accounts
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_cur text := upper(p_currency); v_demo boolean; a public.accounts;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if public.current_app_mode() <> 'demo' then
    raise exception 'Accounts are issued by our banking partner after identity verification';
  end if;
  if v_cur not in ('NGN','GBP','USD','EUR','CAD') then raise exception 'Unsupported currency'; end if;
  select coalesce(bool_or(is_demo), true) into v_demo from public.accounts where user_id = v_uid;
  insert into public.accounts (user_id, currency, is_demo, provider_code)
  values (v_uid, v_cur, v_demo, case when v_demo then 'demo' else null end)
  on conflict (user_id, currency, is_demo) do nothing;
  select * into a from public.accounts where user_id = v_uid and currency = v_cur and is_demo = v_demo;
  return a;
end;
$$;
