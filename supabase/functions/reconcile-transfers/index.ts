// Scheduled reconciliation: polls the provider for transfers stuck in 'processing'. Protect with CRON_SECRET.
import { adminClient, cronAuthorized, json } from "../_shared/util.ts";
import { getAdapter } from "../_shared/registry.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST" || !cronAuthorized(req)) return json({ error: "unauthorized" }, 401);
  const admin = adminClient();
  const { data: stale, error } = await admin.rpc("stale_processing_transfers", { p_minutes: 30 });
  if (error) return json({ error: "query_failed" }, 500);
  const summary = { checked: 0, updated: 0, skipped_no_adapter: 0, errors: 0 };
  for (const row of stale ?? []) {
    const adapter = getAdapter(row.provider_code);
    if (!adapter?.supports("get_transfer_status") || !adapter.getTransferStatus || !row.provider_reference) {
      summary.skipped_no_adapter++; continue;
    }
    summary.checked++;
    try {
      const s = await adapter.getTransferStatus(row.provider_reference);
      if (s.status === "processing") continue;
      const { error: e } = await admin.rpc("server_apply_provider_status", {
        p_transfer_id: row.transfer_id, p_status: s.status, p_reason: s.reason ?? null, p_provider_reference: row.provider_reference,
      });
      if (e) summary.errors++; else summary.updated++;
    } catch { summary.errors++; }
  }
  return json(summary);
});
