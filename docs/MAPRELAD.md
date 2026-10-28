# Maprelad integration status

**Status: NOT INTEGRATED. Every operation is disabled.** Nothing here has been verified against Maprelad.

No Maprelad API documentation, sandbox credentials, or confirmation of the account's approved capabilities was available. Per the project rules, no endpoint, authentication scheme, payload, supported country/currency, fee, limit or webhook signature method has been assumed or invented. The adapter (`supabase/functions/_shared/maprelad.ts`) reports `supports() = false` for everything, so callers return `provider_not_configured` (HTTP 501) and the webhook endpoint refuses all traffic.

| Capability | Supported? | Evidence |
|---|---|---|
| Customer registration / KYC | Unknown | none |
| Virtual / dedicated accounts | Unknown | none |
| Local bank transfer receiving | Unknown | none |
| International transfers | Unknown | none |
| International payment collection | Unknown | none |
| Foreign currency accounts / conversion | Unknown | none |
| Beneficiary management | Unknown | none |
| Transfer status lookup | Unknown | none |
| Webhooks and signature scheme | Unknown | none |
| Refunds / reversals, history, balances | Unknown | none |

## What is needed to proceed (from you)
1. Link to (or export of) Maprelad's official API documentation.
2. Sandbox API credentials, stored with `supabase secrets set`, never in chat or the repo.
3. Written confirmation of which products your account is approved for, and supported countries, currencies, fees and limits.
4. The documented webhook signature method and replay window.

## How each capability is enabled
Implement the matching method in the adapter from the official docs, return `true` from `supports()` for it, add sandbox tests, then insert a `payment_providers` row and an approved `provider_corridors` row. Until then `create_transfer` refuses all non-demo routes.
