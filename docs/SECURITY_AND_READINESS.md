# Security review and production readiness

## Test results (actually executed)
Suite: `supabase/tests/security_and_money_flows.sql`, run against the live `gladebank` schema inside a rolled-back transaction.
- First full run: **135 passed, 3 failed**.
  - 1 real bug found and fixed (`server_record_webhook_event` returned two rows for a duplicate; migration `fix_webhook_dedupe_return`).
  - 1 test-authoring error (staff can see their *own* verification row); assertion corrected.
  - 1 follow-on failure from the same webhook bug.
- After the fixes the three affected assertions were re-run and passed. **The corrected, committed suite has not been executed end-to-end as one run**; re-run it in a dev project to confirm `FAIL=0`.

## Implemented and tested (database layer)
RLS isolation between customers; staff role separation; customers cannot self-grant roles, edit balances, call server-only functions, or forge status changes; idempotent transfer creation; per-transfer/daily limits; fail-closed limits in production; risk-review hook that blocks confirmation; ledger debit/refund exactly-once; append-only ledger and audit log; reconciliation (including tamper detection); incoming-payment crediting with dedupe, wrong-currency and unknown-account rejection; provider completion requires a provider reference and is idempotent; late failure after completion cannot flip status; demo/production separation and fail-closed app mode.

## Implemented but NOT tested
- All Edge Functions (no Deno runtime or network was available to compile or run them).
- Parallel/concurrent requests. Per-user advisory locking and unique constraints are in place, but a single test session cannot race itself. Load-test with parallel connections before launch.
- Supabase Auth hardening (rate limits, brute-force protection, MFA, email verification, password reset) is configuration, not code: not verified.
- Notification email delivery.

## Blocked
- **By missing credentials/docs:** all Maprelad operations (see docs/MAPRELAD.md).
- **By provider limits:** unknown until Maprelad confirms capabilities.
- **By regulatory/operational requirements (must be completed before real money):** legal determination of the permitted service model in Nigeria and each destination; necessary licences or a licensed partner; KYC/AML/sanctions screening process and a real KYC provider (current `staff_review_verification` is a manual stopgap, labelled `manual_review`); transaction-monitoring and SAR procedures; data-protection compliance (NDPR/GDPR); retention policy; incident response; independent penetration test. **Do not describe Saage/Glade as a licensed bank.**

## Known limitations
- Demo exchange rates and fees are hard-coded illustrations inside `demo_quote_transfer`.
- Transfers debit amount + fee from a customer-held account balance; the chosen real-funds model (provider-held vs internal ledger) must be confirmed with the provider and legal counsel. The internal ledger is single-entry per account, not double-entry with a counterparty ledger.
- `server_begin_processing` and the provider call are separate steps; an uncertain provider outcome leaves the transfer in `processing` for reconciliation by design.
- Retention/deletion jobs are not implemented.

## Actions required from you
1. Provide Maprelad docs and sandbox credentials (see docs/MAPRELAD.md).
2. Sign up the first admin, verify their email, then tell me or run the bootstrap SQL in docs/DEPLOYMENT.md.
3. Configure Supabase Auth settings (docs/DEPLOYMENT.md section 5).
4. Obtain legal/compliance guidance before enabling any real corridor.
5. Optionally provide an email provider key (`RESEND_API_KEY`, `EMAIL_FROM`).
