# API reference (Supabase)

All customer calls use the browser Supabase client with the user's session (anon key + JWT). Identity always comes from `auth.uid()` on the server; user ids are never accepted from the client.

## RPC (PostgREST `/rest/v1/rpc/<name>`) - signed-in customers
| Function | Purpose |
|---|---|
| `submit_verification(...)` | Submit identity details (status becomes `pending`; NOT verified) |
| `create_transfer(p_idempotency_key, p_transfer_type, ...)` | Create a draft transfer (limits, route, verification, risk hooks) |
| `confirm_transfer(p_transfer_id)` | Confirm a quoted draft; blocked by open risk review / expired quote |
| `cancel_transfer(p_transfer_id)` | Cancel before processing |
| `current_app_mode()` | `demo` or `production` (drives the DEMO banner) |

## RPC - demo mode only (error in production)
`demo_complete_verification`, `demo_add_funds`, `demo_quote_transfer`, `demo_submit_transfer`, `demo_settle_transfer`.

## RPC - staff (role checked server-side, audited)
`staff_review_verification` (compliance), `staff_resolve_risk_review` (compliance), `staff_set_account_status` (compliance), `staff_set_setting` (admin), `staff_grant_role` / `staff_revoke_role` (admin), `reconcile_account_balances` (finance), `stale_processing_transfers` (finance).

## Direct table reads (RLS-scoped)
`profiles`, `customer_verifications`, `accounts`, `ledger_entries`, `transfers`, `transfer_status_history`, `beneficiaries` (CRUD on own rows, limited columns), `virtual_accounts`, `incoming_payments`, `notifications` (mark read), `support_tickets`, `support_ticket_messages`, `provider_corridors` (approved + mode-appropriate only). Staff roles additionally see the tables listed in docs/DATABASE.md.

## Edge Functions
| Function | Auth | Notes |
|---|---|---|
| `transfer-quote` | user JWT | Real providers; 501 until a provider supports quotes |
| `transfer-submit` | user JWT | Debits then submits; never returns completed |
| `webhooks-maprelad` | provider signature | 501 until implemented |
| `reconcile-transfers` | `x-cron-secret` | Poll stale `processing` transfers |
| `send-notification-emails` | `x-cron-secret` | Marks `not_configured` without an email provider |

Errors use `{ "error": "code", "message": "..." }` with meaningful HTTP status codes; internal details are logged server-side only.
