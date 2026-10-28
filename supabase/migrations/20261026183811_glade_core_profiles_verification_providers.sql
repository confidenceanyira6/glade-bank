-- Shared helper: keep updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- PROFILES (id is always the authenticated user's id)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  country_of_residence text check (country_of_residence is null or char_length(country_of_residence) = 2),
  avatar_url text,
  demo_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile automatically on sign-up (identity comes from auth, not the browser)
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
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- CUSTOMER VERIFICATION (status is set only by server / provider, never by the browser)
create table public.customer_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started','pending','verified','rejected','additional_info_required')),
  legal_name text,
  date_of_birth date,
  address_line1 text,
  address_line2 text,
  city text,
  region text,
  postal_code text,
  country_of_residence text check (country_of_residence is null or char_length(country_of_residence) = 2),
  provider_code text,
  provider_reference text,        -- reference only; identity documents are NOT stored here
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger customer_verifications_updated_at before update on public.customer_verifications
  for each row execute function public.set_updated_at();

-- PAYMENT PROVIDERS (modular: no provider is hardcoded; no secrets stored here)
create table public.payment_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  capabilities text[] not null default '{}',   -- e.g. international_transfer, local_transfer, virtual_account, payment_link, kyc
  is_enabled boolean not null default false,
  is_sandbox boolean not null default true,
  config jsonb not null default '{}'::jsonb,   -- non-secret config only; secrets live in Edge Function secrets
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payment_providers_updated_at before update on public.payment_providers
  for each row execute function public.set_updated_at();

-- CORRIDORS: nothing is offered until a corridor is approved and tested
create table public.provider_corridors (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.payment_providers(id) on delete cascade,
  transfer_type text not null check (transfer_type in ('international','local')),
  source_country char(2) not null,
  source_currency char(3) not null,
  destination_country char(2) not null,
  destination_currency char(3) not null,
  min_amount numeric(18,2) not null default 0,
  max_amount numeric(18,2),
  requires_verification boolean not null default true,
  requires_purpose boolean not null default false,
  estimated_processing_time text,
  is_approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, transfer_type, source_country, source_currency, destination_country, destination_currency)
);
create trigger provider_corridors_updated_at before update on public.provider_corridors
  for each row execute function public.set_updated_at();
create index provider_corridors_lookup_idx on public.provider_corridors (source_country, destination_country, is_approved);

-- BENEFICIARIES (recipients do not need a Glade Bank account)
create table public.beneficiaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  country char(2) not null,
  currency char(3) not null,
  bank_name text,
  account_number text,
  routing_code text,              -- sort code / IBAN / SWIFT / routing, as required
  glade_user_id uuid references auth.users(id) on delete set null,  -- optional: if recipient is a Glade Bank user
  nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger beneficiaries_updated_at before update on public.beneficiaries
  for each row execute function public.set_updated_at();
create index beneficiaries_user_idx on public.beneficiaries (user_id);

-- ROW LEVEL SECURITY
alter table public.profiles enable row level security;
alter table public.customer_verifications enable row level security;
alter table public.payment_providers enable row level security;
alter table public.provider_corridors enable row level security;
alter table public.beneficiaries enable row level security;

-- profiles: users read/update only their own row
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- verification: read own only; writes happen through RPC / server
create policy "verifications_select_own" on public.customer_verifications
  for select to authenticated using (user_id = (select auth.uid()));

-- providers: no direct client access (server only); corridors: expose approved ones only
create policy "corridors_select_approved" on public.provider_corridors
  for select to authenticated using (is_approved = true);

-- beneficiaries: full CRUD on own rows
create policy "beneficiaries_select_own" on public.beneficiaries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "beneficiaries_insert_own" on public.beneficiaries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "beneficiaries_update_own" on public.beneficiaries
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "beneficiaries_delete_own" on public.beneficiaries
  for delete to authenticated using (user_id = (select auth.uid()));

-- Column-level protection: users cannot change email/demo_mode on profile directly
revoke update on public.profiles from authenticated;
grant update (full_name, phone, country_of_residence, avatar_url) on public.profiles to authenticated;
