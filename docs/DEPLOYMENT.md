# Deployment and operations

## 1. Database
Migrations in `supabase/migrations/` are the source of truth (already applied to project `gladebank`).
To reproduce elsewhere: create a NEW dev project (or a Supabase branch), `supabase link --project-ref <dev-ref>`, then `supabase db push`.

## 2. Tests
Run `supabase/tests/security_and_money_flows.sql` in a DEV project (SQL editor or `supabase db query -f`). It rolls itself back and prints a report inside an error whose message starts with `TESTRESULTS`. Expect `FAIL=0`.
Last executed result against `gladebank`: see docs/SECURITY_AND_READINESS.md.

## 3. Edge Functions
```bash
supabase functions deploy transfer-quote transfer-submit webhooks-maprelad reconcile-transfers send-notification-emails
supabase secrets set CRON_SECRET=<32+ random chars>
```
`webhooks-maprelad` must be deployed with JWT verification OFF (`--no-verify-jwt`) because providers cannot send a Supabase JWT; its own signature check is the authentication. It currently refuses everything (501) until the Maprelad adapter is implemented.
Schedule `reconcile-transfers` and `send-notification-emails` (Supabase Cron / pg_cron + pg_net) as POSTs with header `x-cron-secret`.

## 4. First administrator (do this ONLY after that person has signed up and verified their email)
Run once in the SQL editor (service role / dashboard), substituting the verified user's id. Never grant this to an unverified account.
```sql
insert into public.staff_roles (user_id, role) values ('<VERIFIED-USER-UUID>', 'admin');
```
After that, admins manage roles through `staff_grant_role` / `staff_revoke_role` (audited).

## 5. Auth settings to enable in the Supabase dashboard
Email confirmation required, leaked-password protection, minimum password length >= 10, MFA (TOTP) enabled, CAPTCHA on sign-up/sign-in, and review Auth rate limits. Set the Site URL and redirect allow-list to your real domain.

## 6. Frontend (Vercel)
Set only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Serve over HTTPS only.

## 7. Going live is blocked until
See docs/SECURITY_AND_READINESS.md, section "Blocked".
