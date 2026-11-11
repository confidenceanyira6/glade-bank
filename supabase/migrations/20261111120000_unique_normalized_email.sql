-- One account per real inbox.
-- Gmail treats  john.doe@gmail.com, johndoe@gmail.com, johndoe+1@gmail.com and
-- johndoe@googlemail.com as the SAME mailbox, so we normalise before comparing.

create or replace function public.normalize_email(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  e text := lower(btrim(coalesce(p_email, '')));
  local_part text;
  dom text;
begin
  if position('@' in e) = 0 then
    return e;
  end if;
  local_part := split_part(e, '@', 1);
  dom := split_part(e, '@', 2);
  if dom in ('gmail.com', 'googlemail.com') then
    local_part := split_part(local_part, '+', 1);   -- drop +tag
    local_part := replace(local_part, '.', '');      -- dots are ignored by Gmail
    dom := 'gmail.com';
  end if;
  return local_part || '@' || dom;
end;
$$;

alter table public.profiles add column if not exists email_normalized text;

update public.profiles
   set email_normalized = public.normalize_email(email)
 where email is not null and email_normalized is null;

-- NOTE: this fails if existing rows already share a normalised email.
-- Find them with:
--   select email_normalized, count(*) from public.profiles
--   where email_normalized is not null group by 1 having count(*) > 1;
create unique index if not exists profiles_email_normalized_key
  on public.profiles (email_normalized)
  where email_normalized is not null;

-- Sign-up trigger: block duplicates at the database level (cannot be bypassed from the browser)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  norm text := public.normalize_email(new.email);
begin
  if norm <> '' and exists (select 1 from public.profiles where email_normalized = norm) then
    raise exception 'email_already_registered' using errcode = '23505';
  end if;

  insert into public.profiles (id, full_name, email, email_normalized, phone, country_of_residence)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    nullif(norm, ''),
    coalesce(new.phone, new.raw_user_meta_data->>'phone'),
    upper(nullif(new.raw_user_meta_data->>'country_of_residence', ''))
  );
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Friendly pre-check used by the sign-up screen.
-- Returns true when no account uses this inbox yet.
create or replace function public.email_available(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.profiles
    where email_normalized = public.normalize_email(p_email)
  );
$$;
revoke all on function public.email_available(text) from public;
grant execute on function public.email_available(text) to anon, authenticated;
