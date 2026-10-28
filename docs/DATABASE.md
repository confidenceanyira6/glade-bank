# Database

Supabase project: `gladebank` (Postgres 17, eu-west-1). All migrations live in `supabase/migrations/` and are the source of truth. They were captured verbatim from `supabase_migrations.schema_migrations` of the live project.

## Migrations (apply in filename order)

| Version | Name | Purpose |
|---|---|---|
| 20261026183811 | glade_core_profiles_verification_providers | profiles, verification, providers, corridors, beneficiaries, RLS |
| 20261026183942 | glade_money_movement_ledger_notifications | accounts, transfers, ledger, incoming payments, webhooks, notifications, support, transfer RPCs |
| 20261028142002 | staff_roles_audit_risk_support_limits | staff roles, audit log, risk reviews, limits, settings, ticket replies, immutability |

## Reproducing in a separate environment

```bash
supabase link --project-ref <DEV_PROJECT_REF>   # a NEW dev project or a Supabase branch, never production
supabase db push
```

Or paste each file, in order, into the SQL editor of an empty dev project. Note: migration 3 contains one `revoke ... (glade_user_id)` column statement that does not take effect while table-level grants exist; it is corrected by a later migration.

## Security model

- Row Level Security is enabled on every public table.
- Customers can only read their own rows. They cannot write balances, ledger entries, transfers or verification status directly.
- Money moves only through `SECURITY DEFINER` functions. `post_ledger_entry` and `confirm_incoming_payment` are executable by `service_role` only.
- Transfers use idempotency keys (`unique (user_id, idempotency_key)`) and a status state machine enforced by trigger (`enforce_transfer_rules`). A transfer cannot be `completed` without a provider reference.
- `ledger_entries` and `audit_logs` are append-only (update/delete blocked by trigger).
- Staff access uses `staff_roles` and `has_staff_role()`. Customers hold no staff row and cannot grant themselves one.

## Current provider state

`payment_providers` and `provider_corridors` are empty. No route can be created until a provider and an approved corridor are configured, which requires verified provider documentation and credentials.
