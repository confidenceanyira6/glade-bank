-- Applied to project gladebank on 2026-11-10.
-- Countries/currencies a user can add. Only entries Maplerad documents for receiving belong here.
create table if not exists public.country_account_catalog (
  code text primary key,                       -- e.g. 'US-USD'
  country char(2) not null,
  country_name text not null,
  currency char(3) not null,
  flag text,
  activation_fee_usd numeric(10,2) not null default 1.50 check (activation_fee_usd >= 0),
  can_receive boolean not null default true,
  enabled boolean not null default false,
  provider_code text not null default 'maplerad',
  evidence text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists country_account_catalog_updated_at on public.country_account_catalog;
create trigger country_account_catalog_updated_at before update on public.country_account_catalog
  for each row execute function public.set_updated_at();
alter table public.country_account_catalog enable row level security;
drop policy if exists catalog_select_enabled on public.country_account_catalog;
create policy catalog_select_enabled on public.country_account_catalog
  for select to authenticated using (enabled);
revoke insert, update, delete on public.country_account_catalog from anon, authenticated;

insert into public.country_account_catalog (code, country, country_name, currency, flag, activation_fee_usd, can_receive, enabled, evidence, sort_order)
values ('US-USD', 'US', 'United States', 'USD', '🇺🇸', 1.50, true, true,
        'Maplerad docs (maplerad.dev) list USD virtual accounts under Collections. Confirm endpoint, tier and limits in sandbox.', 10)
on conflict (code) do nothing;

-- One row per activation attempt (fee charged -> provider account created, or refunded)
create table if not exists public.account_activations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_code text not null references public.country_account_catalog(code),
  status text not null default 'processing'
    check (status in ('processing','active','failed','failed_refunded','refund_failed')),
  fee_usd numeric(10,2) not null,
  fee_ngn numeric(18,2),
  rate_usd_ngn numeric(18,6),
  rate_source text,
  provider_reference text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists account_activations_one_live_idx
  on public.account_activations (user_id, catalog_code) where status in ('processing','active');
drop trigger if exists account_activations_updated_at on public.account_activations;
create trigger account_activations_updated_at before update on public.account_activations
  for each row execute function public.set_updated_at();
alter table public.account_activations enable row level security;
drop policy if exists activations_select_own on public.account_activations;
create policy activations_select_own on public.account_activations
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.account_activations from anon, authenticated;

-- residents_only: the free "home" account for residents of that country, not purchasable by others.
alter table public.country_account_catalog add column if not exists residents_only boolean not null default false;

insert into public.country_account_catalog (code, country, country_name, currency, flag, activation_fee_usd, can_receive, enabled, residents_only, evidence, sort_order)
values ('NG-NGN', 'NG', 'Nigeria', 'NGN', '🇳🇬', 1.50, true, true, true,
        'Maplerad docs (maplerad.dev): Collections provides NGN virtual accounts.', 1)
on conflict (code) do nothing;

update public.country_account_catalog
set evidence = 'Maplerad docs (maplerad.dev) list USD virtual accounts under Collections. Confirm endpoint, tier, residency rules and limits in sandbox.'
where code = 'US-USD';
