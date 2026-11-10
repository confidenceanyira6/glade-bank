// POST /functions/v1/refresh-rates   (deploy with --no-verify-jwt; the x-cron-secret header is the authentication)
// Pulls USD-based rates from the configured source and stores them through server_store_rates (which applies the
// circuit breaker). Run it every 5 minutes (see docs/RATES.md). ?force=1 bypasses the circuit breaker after you have
// checked that a big move is real.
//
// Secrets (supabase secrets set ...):
//   CRON_SECRET         shared secret the scheduler sends in x-cron-secret
//   RATES_URL           endpoint returning rates quoted per 1 USD, e.g. {"rates": {"NGN": 1500, "EUR": 0.92, ...}}
//   RATES_JSON_PATH     dot path to the rates object (default "rates")
//   RATES_AUTH_HEADER   optional "Header-Name: value" if the source needs a key
//   RATES_CURRENCIES    optional comma list (default NGN,EUR,GBP,CAD,GHS,KES,XAF)
//   RATES_SOURCE        optional label stored with each rate (default: the URL's host)
import { adminClient, json } from "../_shared/util.ts";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  if (!secret || !safeEqual(req.headers.get("x-cron-secret") ?? "", secret)) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("RATES_URL");
  if (!url) return json({ error: "rates_not_configured" }, 501);

  const headers: Record<string, string> = { Accept: "application/json" };
  const auth = Deno.env.get("RATES_AUTH_HEADER");
  if (auth && auth.includes(":")) {
    const i = auth.indexOf(":");
    headers[auth.slice(0, i).trim()] = auth.slice(i + 1).trim();
  }

  let body: unknown;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) { console.error("rates source error", res.status); return json({ error: "source_error", status: res.status }, 502); }
    body = await res.json();
  } catch {
    console.error("rates source unreachable");
    return json({ error: "source_unreachable" }, 502);
  }

  // deno-lint-ignore no-explicit-any
  let node: any = body;
  for (const k of (Deno.env.get("RATES_JSON_PATH") ?? "rates").split(".")) node = node?.[k];
  if (!node || typeof node !== "object") return json({ error: "unexpected_source_shape" }, 502);

  const wanted = (Deno.env.get("RATES_CURRENCIES") ?? "NGN,EUR,GBP,CAD,GHS,KES,XAF").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const rates: Record<string, number> = {};
  for (const c of wanted) {
    const v = Number(node[c]);
    if (Number.isFinite(v) && v > 0) rates[c] = v;
  }
  if (Object.keys(rates).length === 0) return json({ error: "no_usable_rates" }, 502);

  const force = new URL(req.url).searchParams.get("force") === "1";
  const source = Deno.env.get("RATES_SOURCE") ?? new URL(url).hostname;
  const { data, error } = await adminClient().rpc("server_store_rates", { p_rates: rates, p_source: source, p_force: force });
  if (error) { console.error("store rates failed"); return json({ error: "store_failed" }, 500); }
  return json({ ok: true, ...data, missing: wanted.filter((c) => !(c in rates)) });
});
