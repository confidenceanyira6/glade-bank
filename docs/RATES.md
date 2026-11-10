# Live exchange rates

## How it works
- `refresh-rates` (Edge Function) fetches USD-based rates every 5 minutes and stores them with `server_store_rates`.
- Every conversion (`own_transfer_rate`, used by `conversion_quote` and own-account transfers) reads only rates newer than `rate_max_age_minutes` (default 30).
- **Fail-closed:** if rates are stale or missing, conversions return "Exchange rates are temporarily unavailable" instead of using an old or made-up rate. The old hard-coded fallback (1 USD = 1540.25 NGN, etc.) has been removed.
- **Circuit breaker:** a currency that moves more than `rate_max_move_pct` (default 5%) between refreshes is skipped and keeps its last rate until it goes stale. If the move is real, run the function once with `?force=1`.
- The $1.50 country-account fee (`account-add`) uses the same stored USD/NGN rate.

## Setup
```bash
supabase secrets set CRON_SECRET=<long random string>
supabase secrets set RATES_URL=<endpoint returning rates per 1 USD>
supabase secrets set RATES_JSON_PATH=rates                 # path to the rates object in the response
supabase secrets set RATES_AUTH_HEADER="X-Api-Key: <key>"   # only if the source needs a key
supabase functions deploy refresh-rates --no-verify-jwt
```
Then schedule it (run in the SQL editor):
```sql
create extension if not exists pg_net;
select vault.create_secret('<same CRON_SECRET>', 'cron_secret');
select cron.schedule('refresh-rates', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://lfyzzscwgtikkoyufsho.supabase.co/functions/v1/refresh-rates',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'))
  )
$$);
```

## Choosing the rate source (this decides whether you gain or lose)
The app quotes users the stored rate, but your real money moves at your settlement provider's rate. If the two differ you carry the difference.
- Best: use the rate your provider actually settles at (Maplerad's FX rates). Its endpoint is not in the public docs I could find; ask Maplerad and point `RATES_URL` at it.
- A generic market-rate API is a fallback. For NGN, check that it reflects the market you settle in, not only an official rate.
- Conversion fee revenue is separate (tiered $1 to $5 in `conversion_quote`). If you want a safety cushion against rate moves between refreshes, add a small margin on top of the rate.

## Check it is healthy
```sql
select quote_currency, rate, source, fetched_at from public.exchange_rates
where base_currency = 'USD' order by fetched_at desc limit 10;
```
