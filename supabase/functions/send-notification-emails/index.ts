// Delivers email for in-app notifications. Marks 'not_configured' (never 'accepted') unless an email
// provider genuinely accepted the message. Provider: Resend (set RESEND_API_KEY and EMAIL_FROM).
import { adminClient, cronAuthorized, json } from "../_shared/util.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST" || !cronAuthorized(req)) return json({ error: "unauthorized" }, 401);
  const admin = adminClient();
  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  const { data: rows } = await admin.from("notifications")
    .select("id,title,body,user_id").in("email_status", ["not_sent", "not_configured"]).limit(50);
  const out = { accepted: 0, failed: 0, not_configured: 0 };
  for (const n of rows ?? []) {
    const now = new Date().toISOString();
    if (!key || !from) {
      await admin.from("notifications").update({ email_status: "not_configured", email_updated_at: now }).eq("id", n.id);
      out.not_configured++; continue;
    }
    const { data: p } = await admin.from("profiles").select("email").eq("id", n.user_id).maybeSingle();
    if (!p?.email) { await admin.from("notifications").update({ email_status: "failed", email_updated_at: now }).eq("id", n.id); out.failed++; continue; }
    try {
      // Never put credentials or full account numbers in notification text.
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [p.email], subject: n.title, text: n.body ?? n.title }),
        signal: AbortSignal.timeout(10_000),
      });
      if (r.ok) {
        const b = await r.json();
        await admin.from("notifications").update({ email_status: "accepted", email_provider_message_id: b.id ?? null, email_updated_at: now }).eq("id", n.id);
        out.accepted++;
      } else {
        await admin.from("notifications").update({ email_status: "failed", email_updated_at: now }).eq("id", n.id); out.failed++;
      }
    } catch {
      await admin.from("notifications").update({ email_status: "failed", email_updated_at: now }).eq("id", n.id); out.failed++;
    }
  }
  return json(out);
});
