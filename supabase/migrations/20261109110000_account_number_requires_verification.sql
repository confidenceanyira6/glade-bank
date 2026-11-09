-- Applied to project gladebank on 2026-11-09.
-- No account (and therefore no account number) until the user's verification is 'verified'.
create or replace function public.accounts_require_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.customer_verifications v
    where v.user_id = new.user_id and v.status = 'verified'
  ) then
    raise exception 'Complete identity verification before opening an account';
  end if;
  return new;
end;
$$;
revoke execute on function public.accounts_require_verified() from public, anon, authenticated;

drop trigger if exists accounts_require_verified on public.accounts;
-- sorts before accounts_set_number, so the check runs before any number is generated
create trigger accounts_require_verified
  before insert on public.accounts
  for each row execute function public.accounts_require_verified();

create or replace function public.open_default_account_on_verified()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_demo boolean;
begin
  if new.status = 'verified' and (tg_op = 'INSERT' or old.status is distinct from 'verified') then
    v_demo := (public.current_app_mode() = 'demo');
    insert into public.accounts (user_id, currency, is_demo, provider_code)
    values (new.user_id, 'NGN', v_demo, case when v_demo then 'demo' else null end)
    on conflict (user_id, currency, is_demo) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.open_default_account_on_verified() from public, anon, authenticated;

drop trigger if exists open_default_account_on_verified on public.customer_verifications;
create trigger open_default_account_on_verified
  after insert or update of status on public.customer_verifications
  for each row execute function public.open_default_account_on_verified();
