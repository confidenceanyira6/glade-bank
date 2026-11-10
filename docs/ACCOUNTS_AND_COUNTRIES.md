# Accounts and countries

## Free account after verification
When a user is verified they get one free account number:
- Lives in Nigeria: an NGN account (`NG-NGN`, `residents_only`).
- Lives in another country: the account for that country, **only if** it exists and is enabled in `country_account_catalog`. Otherwise `kyc-submit` refuses before contacting Maplerad ("not available in your country yet").

The number is the one Maplerad issues (stored on `accounts` and `virtual_accounts`). Nothing is generated locally.

## Add account ($1.50)
Accounts screen -> **+ Add account** -> pick a country -> pay -> `account-add` Edge Function:
1. Requires a verified user and a Maplerad customer.
2. Fee = `activation_fee_usd` (default 1.50), charged in NGN from the user's Naira account at the latest USD/NGN row in `exchange_rates` (refused if missing or older than 1 hour).
3. Debit (idempotent ledger entry `ACT-<id>-D`) -> create the account at Maplerad -> save to `accounts` + `virtual_accounts`.
4. If Maplerad fails, the fee is credited back (`ACT-<id>-R`) and the attempt is `failed_refunded`. If the refund itself fails the attempt is `refund_failed` (check logs for `CRITICAL`).
5. One live activation per user per country (partial unique index).

## Which countries are offered
Only rows in `country_account_catalog` with `enabled = true`. Seeded from Maplerad's public docs:
- `NG-NGN` Nigeria: Collections provides NGN accounts (docs).
- `US-USD` United States: USD accounts are documented as a Collections product (docs). **Endpoint, KYC tier, residency rules and limits are unconfirmed.**

Maplerad's FAQ also lists NGN, USD, GHS, KES and XAF wallets and payouts to Nigeria, Ghana, Cameroon and Kenya. Those are not offered as receiving accounts because no receiving-account product is documented for them. Add a row (and set `enabled`) only after Maplerad confirms it for your business account. GBP, EUR and CAD are not offered.

## Things you must do before this can work
- Populate `exchange_rates` (USD -> NGN) from Maplerad's FX API or by hand; the table is empty today, so activation returns `rate_unavailable`.
- Confirm in the sandbox that `POST /collections/virtual-account` accepts `currency: USD` for your account, and what tier it needs.
- Money-in (deposits) is not built, so users can't fund the Naira balance by transfer yet; without a balance they can't pay the fee.
- A stuck `processing` activation (crash between charge and save) must be reconciled by hand; check `account_activations`.
