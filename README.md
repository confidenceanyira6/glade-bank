# Glade Bank (Saage Bank)

International money transfer and receiving platform. Backend: Supabase (Postgres, Auth, Edge Functions). Frontend: Vite + React (not built yet).

> **Status: work in progress. Not licensed or approved for real money movement.** No payment provider is enabled. Do not describe this product as a licensed bank until the required authorisation exists.

> **Naming note:** the database and code use the working name "glade" (for example `GB...` transfer references, `glade_user_id`). The product brand in the spec is "Saage Bank". Decide the final name before launch.

## Documentation
- [docs/DATABASE.md](docs/DATABASE.md): schema, security model, migrations
- [docs/API.md](docs/API.md): RPC, tables, Edge Functions
- [docs/MAPRELAD.md](docs/MAPRELAD.md): provider status and what is needed
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): deploy, secrets, first admin, tests
- [docs/SECURITY_AND_READINESS.md](docs/SECURITY_AND_READINESS.md): test results, limitations, blockers

## Security rules (read first)
- Never commit `.env` files or real keys. Use `.env.example` for placeholders only.
- The Supabase service-role key and all provider credentials live only in Supabase Edge Function secrets.
- Only the Supabase URL and anon (publishable) key may be used in the browser.
