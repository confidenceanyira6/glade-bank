-- Applied to project gladebank on 2026-11-09.
-- 1) Auto-confirm new sign-ups (temporary; controlled by app_settings.auto_confirm_signups).
--    To turn off: update public.app_settings set value = 'false'::jsonb where key = 'auto_confirm_signups';
--    and switch "Confirm email" on in the Supabase Auth dashboard.
insert into public.app_settings (key, value) values ('auto_confirm_signups', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function public.auto_confirm_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select value #>> '{}' from public.app_settings where key = 'auto_confirm_signups'), 'false') = 'true' then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  end if;
  return new;
end;
$$;
revoke execute on function public.auto_confirm_new_user() from public, anon, authenticated;

drop trigger if exists auto_confirm_new_user on auth.users;
create trigger auto_confirm_new_user
  before insert on auth.users
  for each row execute function public.auto_confirm_new_user();

-- 2) Outside demo mode the old in-database KYC paths are closed; verification goes through the kyc-submit Edge Function (Maplerad).
create or replace function public.submit_my_kyc(p_legal_name text, p_dob date, p_address text, p_city text, p_region text, p_postal text, p_country text, p_id_type text, p_id_number text, p_bvn text, p_nin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_demo boolean; v_status text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if public.current_app_mode() <> 'demo' then raise exception 'Verification is not available yet. Please try again later.'; end if;
  if p_legal_name is null or length(trim(p_legal_name)) < 3 then raise exception 'Enter your full legal name'; end if;
  if p_dob is null or p_dob > (current_date - interval '18 years') then raise exception 'You must be at least 18'; end if;
  if p_bvn !~ '^[0-9]{11}$' then raise exception 'BVN must be 11 digits'; end if;
  if p_nin !~ '^[0-9]{11}$' then raise exception 'NIN must be 11 digits'; end if;
  if coalesce(length(trim(p_address)),0) < 5 then raise exception 'Enter your residential address'; end if;
  select coalesce(demo_mode, true) into v_demo from public.profiles where id = v_uid;
  v_status := case when coalesce(v_demo, true) then 'verified' else 'pending' end;
  insert into public.kyc_submissions (user_id, tier, id_type, id_last4, bvn_last4, nin_last4, status)
  values (v_uid, 3, p_id_type, right(coalesce(p_id_number,''),4), right(p_bvn,4), right(p_nin,4), case when v_status='verified' then 'approved' else 'pending' end);
  insert into public.customer_verifications (user_id, status, legal_name, date_of_birth, address_line1, city, region, postal_code, country_of_residence, submitted_at, reviewed_at)
  values (v_uid, v_status, trim(p_legal_name), p_dob, trim(p_address), nullif(trim(coalesce(p_city,'')),''), nullif(trim(coalesce(p_region,'')),''), nullif(trim(coalesce(p_postal,'')),''), nullif(upper(coalesce(p_country,'')),''), now(), case when v_status='verified' then now() else null end)
  on conflict (user_id) do update set status = excluded.status, legal_name = excluded.legal_name, date_of_birth = excluded.date_of_birth,
    address_line1 = excluded.address_line1, city = excluded.city, region = excluded.region, postal_code = excluded.postal_code,
    country_of_residence = excluded.country_of_residence, submitted_at = excluded.submitted_at, reviewed_at = excluded.reviewed_at, rejection_reason = null;
  return jsonb_build_object('status', v_status);
end;
$$;

create or replace function public.submit_verification(p_legal_name text, p_date_of_birth date, p_address_line1 text, p_address_line2 text, p_city text, p_region text, p_postal_code text, p_country text)
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
  if public.current_app_mode() <> 'demo' then raise exception 'Verification is not available yet. Please try again later.'; end if;
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

-- 3) Confirm any account that is still unconfirmed (matches the auto-confirm setting)
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;

-- 4) Production switch (run separately; applied to gladebank on 2026-11-09):
--    update public.app_settings set value = '"production"'::jsonb, updated_at = now() where key = 'app_mode';
--    To go back: set value = '"demo"'.
