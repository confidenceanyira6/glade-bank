// Customer requests a quote for a draft transfer. Real providers only; demo uses the demo_quote_transfer RPC.
import { adminClient, json, safeMessage, userClient } from "../_shared/util.ts";
import { getAdapter } from "../_shared/registry.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await userClient(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  try {
    const { transfer_id } = await req.json();
    // RLS guarantees the customer can only load their own transfer
    const { data: t } = await caller.client.from("transfers").select("*").eq("id", transfer_id).maybeSingle();
    if (!t) return json({ error: "not_found" }, 404);
    if (t.is_demo) return json({ error: "use_demo_flow" }, 400);
    if (t.status !== "draft") return json({ error: "invalid_state" }, 409);

    const adapter = getAdapter(t.provider_code);
    if (!adapter || !adapter.supports("quote") || !adapter.quote) {
      return json({ error: "provider_not_configured", message: "Quotes are not available for this route yet." }, 501);
    }
    const q = await adapter.quote({
      sourceCountry: t.source_country, sourceCurrency: t.source_currency,
      destinationCountry: t.destination_country, destinationCurrency: t.destination_currency,
      sourceAmount: String(t.source_amount),
    });
    const { data, error } = await adminClient().rpc("server_apply_quote", {
      p_transfer_id: t.id, p_fee: q.fee, p_rate: q.rate, p_destination_amount: q.destinationAmount,
      p_quote_id: q.quoteId, p_expires_at: q.expiresAt,
    });
    if (error) return json({ error: "quote_failed", message: safeMessage(error) }, 400);
    return json({ transfer: data });
  } catch (e) {
    console.error("transfer-quote failed", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500);
  }
});
