# Maplerad integration (replaces the old "not integrated" note)

Provider name is spelled **Maplerad** (docs: https://maplerad.dev). Older files use "maprelad"; the old `webhooks-maprelad` function is superseded by `webhooks-maplerad` and can be deleted.

## Status
Built, **never run**: no sandbox key existed when this was written. Treat every call as unverified until a sandbox run passes.

| Piece | State |
|---|---|
| `kyc-submit` Edge Function: create customer (tier 0), upgrade tier 1, mark verified, open NGN virtual account | Built, untested |
| DB: accounts/numbers only after verification; real accounts only with a provider-issued number | Applied to live DB |
| `webhooks-maplerad`: signature check, de-dupe, logging | Built, fails closed (501) until configured, untested |
| Credit incoming deposits from webhooks | **Not built** (event names/payloads unknown) |
| Outgoing transfers via Maplerad | **Not built** (endpoint/payload unknown) |
| Tier 2 (NIN document) | **Not built** |
| Frontend "Verify KYC" button/form | Helper only: `frontend/src/kycApi.js` |

## Hosted KYC page
No hosted KYC page appears in Maplerad's public docs. KYC is API-based: Glade collects the details and sends them. If your Maplerad contact has a hosted-link product, tell us and the flow changes.

## Flow
1. User taps **Verify KYC**, fills the form, app calls `kyc-submit`.
2. Function: `POST /customers` (tier 0) -> `PATCH /customers/upgrade/tier1` (BVN, DOB, phone, address) -> verification = `verified` -> `POST /collections/virtual-account` (NGN).
3. The Maplerad account number is stored on `accounts`. Calling `kyc-submit` again retries account creation if step 2 stopped midway.
4. BVN is never stored; only its last 4 digits (`kyc_submissions.bvn_last4`).

## Setup when you have keys
```bash
supabase secrets set MAPLERAD_SECRET_KEY=...        # sandbox key first
supabase secrets set MAPLERAD_BASE_URL=...          # sandbox base URL from Maplerad docs/dashboard
supabase secrets set MAPLERAD_AUTH_SCHEME=Bearer    # confirm in Maplerad's Authentication page
supabase secrets set MAPLERAD_WEBHOOK_SECRET=...
supabase secrets set MAPLERAD_WEBHOOK_SIGNATURE_HEADER=...   # from "Verifying Webhooks"
supabase secrets set MAPLERAD_WEBHOOK_SIGNATURE_ENCODING=hex # or base64
supabase functions deploy kyc-submit
supabase functions deploy webhooks-maplerad --no-verify-jwt
```
Then register `https://<project>.supabase.co/functions/v1/webhooks-maplerad` in the Maplerad dashboard.

## Must be confirmed in the sandbox before going live
- Auth header scheme and base URLs (sandbox/live).
- Response shapes: customer id, virtual account number/bank name (parsed defensively in `maplerad_client.ts`).
- Whether tier 1 upgrade is approved synchronously, and whether `photo` is required.
- Field names for tier 1 (Maplerad's guide uses `phone_country_code`/`phone_number`; one SDK example differs).
- Webhook signature scheme, event names, replay window.
- Which products, limits and fees your Maplerad account is approved for (Collections, Transfers).
