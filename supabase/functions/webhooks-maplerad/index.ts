// POST /functions/v1/webhooks-maplerad   (deploy with --no-verify-jwt; the signature IS the authentication)
//
// FAIL-CLOSED: until the signature scheme is configured from Maplerad's "Verifying Webhooks" page, every request is refused.
// Secrets (supabase secrets set ...):
//   MAPLERAD_WEBHOOK_SECRET               signing secret from the Maplerad dashboard
//   MAPLERAD_WEBHOOK_SIGNATURE_HEADER     header name carrying the signature (from Maplerad docs)
//   MAPLERAD_WEBHOOK_SIGNATURE_ENCODING   "hex" or "base64" (from Maplerad docs)
// The scheme assumed here is HMAC-SHA256 of the raw request body. If Maplerad's documented scheme differs
// (e.g. signs a timestamp too), change verify() below before enabling.
//
// This version verifies, de-duplicates and LOGS events only. It does NOT credit balances: deposit and transfer event
// names/payloads must be taken from Maplerad's docs/sandbox before any money-moving handler is added.
import { adminClient, json } from "../_shared/util.ts";

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function verify(raw: string, req: Request): Promise<boolean | "unconfigured"> {
  const secret = Deno.env.get("MAPLERAD_WEBHOOK_SECRET") ?? "";
  const header = Deno.env.get("MAPLERAD_WEBHOOK_SIGNATURE_HEADER") ?? "";
  const enc = Deno.env.get("MAPLERAD_WEBHOOK_SIGNATURE_ENCODING") ?? "";
  if (!secret || !header || (enc !== "hex" && enc !== "base64")) return "unconfigured";
  const got = (req.headers.get(header) ?? "").trim().replace(/^sha256=/i, "");
  if (!got) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  return safeEqual(enc === "hex" ? toHex(sig) : toBase64(sig), got);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const raw = await req.text(); // exact bytes; never re-serialise before verifying
  if (raw.length > 1_000_000) return json({ error: "too_large" }, 413);

  const ok = await verify(raw, req);
  if (ok === "unconfigured") return json({ error: "webhook_not_configured" }, 501);
  if (!ok) return json({ error: "invalid_signature" }, 401);

  // deno-lint-ignore no-explicit-any
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ error: "invalid_json" }, 400); }

  const digest = toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  const eventType = typeof payload?.event === "string" ? payload.event : typeof payload?.type === "string" ? payload.type : null;

  const { error } = await adminClient().from("provider_webhook_log").insert({
    provider_code: "maplerad", body_sha256: digest, event_type: eventType, payload,
  });
  if (error && error.code !== "23505") {
    console.error("webhook log failed");
    return json({ error: "server_error" }, 500); // non-2xx so the provider retries
  }
  return json({ received: true, duplicate: error?.code === "23505" });
});
