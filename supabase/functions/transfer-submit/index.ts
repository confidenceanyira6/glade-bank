// Submits a CONFIRMED transfer to the provider. Never reports completion: only a verified provider
// webhook or reconciliation poll can complete a transfer.
import { adminClient, json, userClient } from "../_shared/util.ts";
import { getAdapter } from "../_shared/registry.ts";
import { ProviderRejectedError } from "../_shared/provider.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await userClient(req);
  if (!caller) return json({ error: "unauthorized" }, 401);
  const admin = adminClient();
  try {
    const { transfer_id } = await req.json();
    const { data: t } = await caller.client.from("transfers").select("*").eq("id", transfer_id).maybeSingle();
    if (!t) return json({ error: "not_found" }, 404);
    if (t.is_demo) return json({ error: "use_demo_flow" }, 400);
    if (t.status !== "awaiting_payment") return json({ error: "invalid_state" }, 409);

    // Check provider capability BEFORE debiting anything
    const adapter = getAdapter(t.provider_code);
    if (!adapter || !adapter.supports("create_transfer") || !adapter.createTransfer) {
      return json({ error: "provider_not_configured", message: "This route cannot process transfers yet." }, 501);
    }

    const { error: begErr } = await admin.rpc("server_begin_processing", { p_transfer_id: t.id });
    if (begErr) return json({ error: "cannot_start", message: begErr.message.slice(0, 120) }, 400);

    try {
      const res = await adapter.createTransfer({
        reference: t.reference, quoteId: t.provider_quote_id,
        sourceAmount: String(t.source_amount), sourceCurrency: t.source_currency,
        destinationCurrency: t.destination_currency,
        recipient: { name: t.recipient_name, bankName: t.recipient_bank_name, accountNumber: t.recipient_account_number,
                     routingCode: t.recipient_routing_code, country: t.destination_country },
      });
      await admin.rpc("server_record_provider_submission", { p_transfer_id: t.id, p_provider_reference: res.providerReference });
      return json({ status: "processing", reference: t.reference }, 202);
    } catch (e) {
      if (e instanceof ProviderRejectedError) {
        // definitive refusal: fail and refund through the ledger
        await admin.rpc("server_apply_provider_status", { p_transfer_id: t.id, p_status: "failed", p_reason: "Provider rejected the transfer" });
        return json({ error: "rejected", status: "refunded" }, 422);
      }
      // Unknown outcome: stay in processing, never auto-retry, let reconciliation decide
      console.error("transfer-submit uncertain outcome", t.reference);
      return json({ status: "processing", reference: t.reference, note: "awaiting provider confirmation" }, 202);
    }
  } catch (e) {
    console.error("transfer-submit failed", e instanceof Error ? e.message : e);
    return json({ error: "server_error" }, 500);
  }
});
