// POST /functions/v1/account-add   (JWT required)
// { action: 'list' }                            -> countries the user can add, fee in USD and (if a fresh rate exists) NGN
// { action: 'activate', code, max_ngn? }        -> charge the activation fee from the user's NGN balance, then open the
//                                                  country account at Maplerad. If Maplerad fails, the fee is refunded.
//
// Rules: user must be verified; the free home account (their own country) is issued at verification and is never
// sold here; only enabled catalog entries (countries Maplerad documents for receiving) are offered.
// Fee: country_account_catalog.activation_fee_usd (default $1.50), charged in NGN at the latest USD/NGN rate in
// exchange_rates (must be < 1 hour old, otherwise activation is refused). The debit and refund are idempotent
// ledger entries keyed by the activation id.
import { adminClient, json, safeMessage, userClient } from "../_shared/util.ts";
import { createVirtualAccount, mapleradConfigured, MapleradError } from "../_shared/maplerad_client.ts";

type Admin = ReturnType<typeof adminClient>;
const RATE_MAX_AGE_MS = 60 * 60 * 1000;

const fail = (error: string, message: string, status: number, extra: Record<string, unknown> = {}) =>
  json({ error, message, ...extra }, status);

async function usdNgnRate(admin: Admin) {
  const { data } = await admin.from("exchange_rates").select("rate,source,fetched_at")
    .eq("base_currency", "USD").eq("quote_currency", "NGN").order("fetched_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  if (Date.now() - new Date(data.fetched_at).getTime() > RATE_MAX_AGE_MS) return null;
  const rate = Number(data.rate);
  return rate > 0 ? { rate, source: String(data.source) } : null;
}
const feeNgn = (feeUsd: number, rate: number) => Math.ceil(Number((feeUsd * rate * 100).toFixed(6))) / 100;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const u = await userClient(req);
  if (!u) return json({ error: "unauthorized" }, 401);
  const admin = adminClient();
  const uid = u.user.id;

  // deno-lint-ignore no-explicit-any
  let b: any;
  try { b = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  try {
    const ver = await admin.from("customer_verifications").select("status").eq("user_id", uid).maybeSingle();
    const verified = ver.data?.status === "verified";

    const owned = await admin.from("accounts").select("id,currency,balance").eq("user_id", uid).eq("is_demo", false);
    const ownedCurrencies = new Set((owned.data ?? []).map((a) => String(a.currency)));
    const rate = await usdNgnRate(admin);

    const cat = await admin.from("country_account_catalog")
      .select("code,country,country_name,currency,flag,activation_fee_usd,can_receive,residents_only")
      .eq("enabled", true).eq("can_receive", true).eq("residents_only", false).order("sort_order");
    const addable = (cat.data ?? []).filter((r) => !ownedCurrencies.has(String(r.currency)));

    if (b.action === "list") {
      return json({
        verified,
        rate_available: !!rate,
        addable: addable.map((r) => ({
          code: r.code, country: r.country, country_name: r.country_name, currency: r.currency, flag: r.flag,
          fee_usd: Number(r.activation_fee_usd),
          fee_ngn: rate ? feeNgn(Number(r.activation_fee_usd), rate.rate) : null,
        })),
      });
    }

    if (b.action !== "activate") return json({ error: "invalid_action" }, 400);

    // ---------------- activate ----------------
    if (!verified) return fail("not_verified", "Verify your identity first.", 403);
    if (!mapleradConfigured()) return fail("provider_not_configured", "This feature is not available yet.", 503);
    const row = addable.find((r) => r.code === b.code);
    if (!row) return fail("not_available", "That country account is not available or you already have it.", 404);

    const pc = await admin.from("provider_customers").select("provider_customer_id").eq("user_id", uid).maybeSingle();
    const customerId = pc.data?.provider_customer_id;
    if (!customerId) return fail("no_provider_customer", "Your verification is not linked to our banking partner yet.", 409);

    if (!rate) return fail("rate_unavailable", "Pricing is temporarily unavailable. Please try again shortly.", 503);
    const feeUsd = Number(row.activation_fee_usd);
    const feeN = feeNgn(feeUsd, rate.rate);
    if (typeof b.max_ngn === "number" && feeN > b.max_ngn * 1.02) {
      return fail("price_changed", "The price changed. Please review and try again.", 409, { fee_ngn: feeN });
    }

    const ngn = (owned.data ?? []).find((a) => a.currency === "NGN");
    if (!ngn) return fail("no_funding_account", "You need a Naira account to pay the activation fee.", 409);
    if (Number(ngn.balance) < feeN) {
      return fail("insufficient_funds", `Add at least \u20a6${feeN.toLocaleString("en-NG")} to your Naira account to activate this account.`, 402, { needed_ngn: feeN });
    }

    // Record the attempt first; the partial unique index stops double activation.
    const act = await admin.from("account_activations").insert({
      user_id: uid, catalog_code: row.code, status: "processing", fee_usd: feeUsd, fee_ngn: feeN,
      rate_usd_ngn: rate.rate, rate_source: rate.source,
    }).select("id").single();
    if (act.error || !act.data) return fail("already_in_progress", "This account is already being activated or is active.", 409);
    const actId: string = act.data.id;
    const setStatus = (status: string, failure_reason: string | null = null, provider_reference: string | null = null) =>
      admin.from("account_activations").update({ status, failure_reason, ...(provider_reference ? { provider_reference } : {}) }).eq("id", actId);

    // 1) charge
    const debit = await admin.rpc("post_ledger_entry", {
      p_account_id: ngn.id, p_direction: "debit", p_amount: feeN,
      p_description: `Account activation fee: ${row.country_name} ${row.currency}`, p_provider_reference: `ACT-${actId}-D`,
    });
    if (debit.error) {
      await setStatus("failed", "debit_failed");
      const insufficient = String(debit.error.message).includes("Insufficient");
      return insufficient
        ? fail("insufficient_funds", "Your Naira balance is too low to pay the activation fee.", 402, { needed_ngn: feeN })
        : fail("charge_failed", "We could not charge the activation fee. Please try again.", 500);
    }

    // 2) open the account at the banking partner; refund the fee if that fails
    let va;
    try {
      va = await createVirtualAccount(customerId, String(row.currency));
    } catch (e) {
      const reason = e instanceof MapleradError ? `provider_${e.status}` : "provider_error";
      const refund = await admin.rpc("post_ledger_entry", {
        p_account_id: ngn.id, p_direction: "credit", p_amount: feeN,
        p_description: `Refund: ${row.country_name} account activation`, p_provider_reference: `ACT-${actId}-R`,
      });
      if (refund.error) {
        console.error("CRITICAL refund failed for activation", actId);
        await setStatus("refund_failed", reason);
        return fail("activation_failed", "Activation failed and your refund is being processed. Contact support if it doesn't arrive.", 502);
      }
      await setStatus("failed_refunded", reason);
      const msg = e instanceof MapleradError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403
        ? e.message : "We couldn't open the account right now. You were not charged.";
      return fail("activation_failed", msg, 502);
    }

    // 3) save the account. If saving fails after the partner account exists, keep 'processing' for manual reconciliation.
    const ins = await admin.from("accounts").insert({
      user_id: uid, currency: row.currency, is_demo: false, provider_code: "maplerad",
      provider_account_reference: va.reference, account_number: va.account_number, bank_name: va.bank_name ?? "Glade Bank",
    }).select("account_number,bank_name,currency").single();
    if (ins.error) {
      console.error("CRITICAL account save failed after provider success, activation", actId);
      await admin.from("account_activations").update({ failure_reason: "save_failed", provider_reference: va.reference }).eq("id", actId);
      return fail("activation_pending", "Your account is being finalised. Please check back shortly.", 202);
    }
    const who = await admin.from("customer_verifications").select("legal_name").eq("user_id", uid).maybeSingle();
    const vins = await admin.from("virtual_accounts").insert({
      user_id: uid, provider_code: "maplerad", currency: row.currency, country: row.country,
      account_name: va.account_name ?? who.data?.legal_name ?? "Glade Bank customer",
      account_number: va.account_number, bank_name: va.bank_name, routing_code: va.routing_code,
      provider_reference: va.reference ?? `${customerId}:${row.currency}`,
    });
    if (vins.error) console.error("virtual_accounts insert failed");
    await setStatus("active", null, va.reference);
    return json({ status: "active", account: ins.data, charged_ngn: feeN, fee_usd: feeUsd });
  } catch (e) {
    console.error("account-add failed", safeMessage(e));
    return fail("server_error", "Request failed", 500);
  }
});
