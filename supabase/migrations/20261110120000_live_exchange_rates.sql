-- Applied to project gladebank on 2026-11-10.
-- Rate safety settings
insert into public.app_settings (key, value) values
  ('rate_max_age_minutes', '30'::jsonb),
  ('rate_max_move_pct', '5'::jsonb)
on conflict (key) do nothing;

create index if not exists exchange_rates_lookup_idx
  on public.exchange_rates (base_currency, quote_currency, fetched_at desc);

-- Store a batch of rates (currency -> units per 1 USD). Service role only.
-- Circuit breaker: a pair that moves more than rate_max_move_pct since its last stored rate is skipped unless p_force.
create or replace function public.server_store_rates(p_rates jsonb, p_source text, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_move numeric := coalesce((select (value #>> '{}')::numeric from public.app_settings where key = 'rate_max_move_pct'), 5);
  k text; v numeric; prev numeric; stored integer := 0; skipped jsonb := '[]'::jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then raise exception 'Forbidden'; end if;
  if p_source is null or length(p_source) < 2 then raise exception 'Source required'; end if;
  if jsonb_typeof(p_rates) <> 'object' then raise exception 'Rates must be an object'; end if;

  for k, v in select e.key, (e.value #>> '{}')::numeric from jsonb_each(p_rates) e loop
    if k !~ '^[A-Z]{3}$' or k = 'USD' then continue; end if;
    if v is null or v <= 0 then skipped := skipped || to_jsonb(k || ':invalid'); continue; end if;
    select rate into prev from public.exchange_rates
      where base_currency = 'USD' and quote_currency = k order by fetched_at desc limit 1;
    if not p_force and prev is not null and abs(v / prev - 1) * 100 > v_max_move then
      skipped := skipped || to_jsonb(k || ':moved_too_much'); continue;
    end if;
    insert into public.exchange_rates (base_currency, quote_currency, rate, source, fetched_at)
    values ('USD', k, v, p_source, now()), (k, 'USD', round(1 / v, 10), p_source, now());
    stored := stored + 1;
  end loop;
  return jsonb_build_object('stored', stored, 'skipped', skipped);
end;
$$;
revoke execute on function public.server_store_rates(jsonb, text, boolean) from public, anon, authenticated;
grant execute on function public.server_store_rates(jsonb, text, boolean) to service_role;

-- Conversion rate: always derived from FRESH stored rates (via USD). No hard-coded fallback; if rates are stale, conversions pause.
create or replace function public.own_transfer_rate(p_from text, p_to text)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from text := upper(p_from); v_to text := upper(p_to);
  v_max_age integer := coalesce((select (value #>> '{}')::integer from public.app_settings where key = 'rate_max_age_minutes'), 30);
  a numeric; b numeric;
begin
  if v_from = v_to then return 1; end if;
  a := case when v_from = 'USD' then 1 else (
    select rate from public.exchange_rates
    where base_currency = 'USD' and quote_currency = v_from and fetched_at > now() - make_interval(mins => v_max_age)
    order by fetched_at desc limit 1) end;
  b := case when v_to = 'USD' then 1 else (
    select rate from public.exchange_rates
    where base_currency = 'USD' and quote_currency = v_to and fetched_at > now() - make_interval(mins => v_max_age)
    order by fetched_at desc limit 1) end;
  if a is null or b is null then
    raise exception 'Exchange rates are temporarily unavailable. Please try again shortly.';
  end if;
  return round(b / a, 8);
end;
$$;

-- Keep a week of rate history
select cron.schedule('prune-exchange-rates', '17 3 * * *', $cron$delete from public.exchange_rates where fetched_at < now() - interval '7 days'$cron$);
