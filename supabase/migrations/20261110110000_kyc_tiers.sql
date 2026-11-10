-- Applied to project gladebank on 2026-11-10.
-- Glade KYC levels: 1 = normal (email + phone, everyone), 2 = BVN verified (gets the free account number), 3 = NIN + ID.
alter table public.customer_verifications
  add column if not exists kyc_tier smallint not null default 1 check (kyc_tier between 1 and 3);

create or replace function public.kyc_tier_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'verified' then
    if new.kyc_tier < 2 then new.kyc_tier := 2; end if;   -- verified means BVN level at least
  else
    new.kyc_tier := 1;                                      -- not verified: back to the normal level
  end if;
  return new;
end;
$$;

drop trigger if exists kyc_tier_guard on public.customer_verifications;
create trigger kyc_tier_guard
  before insert or update of status, kyc_tier on public.customer_verifications
  for each row execute function public.kyc_tier_guard();

-- Backfill: verified users who already gave a NIN are level 3, other verified users level 2.
update public.customer_verifications cv
set kyc_tier = case when exists (
      select 1 from public.kyc_submissions s where s.user_id = cv.user_id and s.nin_last4 is not null
    ) then 3 else 2 end
where cv.status = 'verified';
