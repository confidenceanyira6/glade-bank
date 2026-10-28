// Provider webhook receiver. Fails closed: with no verified signature scheme implemented
// (see _shared/maprelad.ts) every request is refused and nothing is credited or completed.
import { adminClient, json } from "../_shared/util.ts";
import { getAdapter } from "../_shared/registry.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const adapter = getAdapter("maprelad");
  if (!adapter || !adapter.supports("verify_webhook") || !adapter.verifyWebhook) {
    return json({ error: "webhook_verification_not_configured" }, 501);
  }
  const raw = await req.text();
  const event = await adapter.verifyWebhook(req, raw);
  if (!event) return json({ error: "invalid_signature" }, 401);

  const admin = adminClient();
  const { data: rec, error: recErr } = await admin.rpc("server_record_webhook_event", {
    p_provider_code: adapter.code, p_event_id: event.eventId, p_event_type: event.type,
    p_payload: JSON.parse(raw), p_signature_verified: true,
  });
  if (recErr || !rec?.[0]) return json({ error: "record_failed" }, 500);
  if (rec[0].is_duplicate) return json({ ok: true, duplicate: true });
  const rowId = rec[0].event_row_id as string;

  try {
    if (event.kind === "incoming_payment") {
      const { error } = await admin.rpc("server_process_incoming_payment", {
        p_provider_code: adapter.code, p_provider_reference: event.providerReference,
        p_receiving_account_ref: event.receivingAccountRef, p_amount: event.amount, p_currency: event.currency,
        p_sender_name: event.senderName, p_sender_details: {}, p_fee: event.fee,
      });
      if (error) throw new Error(error.message);
    } else if (event.kind === "transfer_status") {
      const { data: t } = await admin.from("transfers").select("id")
        .eq("provider_code", adapter.code).eq("provider_reference", event.providerReference).maybeSingle();
      if (!t) throw new Error("Unknown provider reference");
      const { error } = await admin.rpc("server_apply_provider_status", {
        p_transfer_id: t.id, p_status: event.status, p_reason: event.reason ?? null, p_provider_reference: event.providerReference,
      });
      if (error) throw new Error(error.message);
    }
    await admin.rpc("server_mark_webhook_processed", { p_event_row_id: rowId, p_error: null });
    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "processing error";
    await admin.rpc("server_mark_webhook_processed", { p_event_row_id: rowId, p_error: msg });
    // 500 lets the provider retry; processing is idempotent so retries are safe
    return json({ error: "processing_failed" }, 500);
  }
});
