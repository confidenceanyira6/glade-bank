// POST /functions/v1/kyc-submit   (JWT required)
// Flow: user taps "Verify KYC" -> app collects details -> this function creates the Maplerad customer (tier 0),
// upgrades it to tier 1, marks the user verified, then opens their FREE home account: an NGN account for residents
// of Nigeria, or the account for their own country if it is in country_account_catalog.
// Safe to call again: if already verified it only (re)provisions the account.
// BVN / ID numbers are forwarded to Maplerad and never stored; only the last 4 digits are kept for audit.
import { adminClient, json, safeMessage, userClient } from "../_shared/util.ts";
import {
  createCustomer,
  createVirtualAccount,
  mapleradConfigured,
  MapleradError,
  upgradeTier1,
} from "../_shared/maplerad_client.ts";

type Admin = ReturnType<typeof adminClient>;

async function homeCatalogRow(admin: Admin, country: string) {
  const { data } = await admin.from("country_account_catalog").select("code,currency,country")
    .eq("country", country).eq("enabled", true).eq("can_receive", true)
    .order("sort_order").limit(1).maybeSingle();
  return data;
}

async function provisionAccount(admin: Admin, uid: string) {
  const v = await admin.from("customer_verifications").select("country_of_residence,legal_name").eq("user_id", uid).maybeSingle();
  const country = String(v.data?.country_of_residence ?? "NG").toUpperCase();
  const row = await homeCatalogRow(admin, country);
  if (!row) throw new MapleradError("Accounts are not available in your country yet", 409);

  const existing = await admin.from("accounts").select("account_number,bank_name,currency")
    .eq("user_id", uid).eq("currency", row.currency).eq("is_demo", false).maybeSingle();
  if (existing.data) return existing.data;

  const pc = await admin.from("provider_customers").select("provider_customer_id").eq("user_id", uid).maybeSingle();
  const customerId = pc.data?.provider_customer_id;
  if (!customerId) throw new MapleradError("No banking partner customer for this user", 409);

  const va = await createVirtualAccount(customerId, row.currency);
  const ins = await admin.from("accounts").insert({
    user_id: uid,
    currency: row.currency,
    is_demo: false,
    provider_code: "maplerad",
    provider_account_reference: va.reference,
    account_number: va.account_number,
    bank_name: va.bank_name ?? "Glade Bank",
  }).select("account_number,bank_name,currency").single();
  if (ins.error) throw new Error("Could not save account");

  const vins = await admin.from("virtual_accounts").insert({
    user_id: uid, provider_code: "maplerad", currency: row.currency, country,
    account_name: va.account_name ?? v.data?.legal_name ?? "Glade Bank customer",
    account_number: va.account_number, bank_name: va.bank_name, routing_code: va.routing_code,
    provider_reference: va.reference ?? `${customerId}:${row.currency}`,
  });
  if (vins.error) console.error("virtual_accounts insert failed");
  return ins.data;
}

function parseDob(v: unknown): { iso: string; maplerad: string } | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  const eighteen = new Date(); eighteen.setUTCFullYear(eighteen.getUTCFullYear() - 18);
  if (d > eighteen) return null;
  const [y, m, day] = v.split("-");
  return { iso: v, maplerad: `${day}-${m}-${y}` };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const u = await userClient(req);
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!mapleradConfigured()) return json({ error: "provider_not_configured" }, 503);

  const admin = adminClient();
  const uid = u.user.id;

  try {
    const ver = await admin.from("customer_verifications").select("status").eq("user_id", uid).maybeSingle();
    if (ver.data?.status === "verified") {
      const account = await provisionAccount(admin, uid);
      return json({ status: "verified", account });
    }
    if (ver.data?.status === "pending") return json({ error: "already_pending" }, 409);

    // ---- validate input ----
    // deno-lint-ignore no-explicit-any
    let b: any;
    try { b = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const country = String(b.country ?? "NG").toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return json({ error: "Choose your country" }, 400);
    if (!(await homeCatalogRow(admin, country))) {
      return json({ error: "Glade Bank accounts are not available in your country yet" }, 422);
    }
    const isNG = country === "NG";
    const legalName = String(b.legal_name ?? "").trim();
    const dob = parseDob(b.date_of_birth);
    const bvn = String(b.bvn ?? "");
    const idNumber = String(b.id_number ?? "").trim();
    const phoneCode = String(b.phone_country_code ?? (isNG ? "+234" : ""));
    const phoneNumber = String(b.phone_number ?? "").replace(/\D/g, "");
    const a = b.address ?? {};
    const street = String(a.street ?? "").trim();
    const city = String(a.city ?? "").trim();
    const state = String(a.state ?? "").trim();
    const postal = String(a.postal_code ?? "").trim();
    const photo = typeof b.photo_url === "string" && b.photo_url.startsWith("https://") ? b.photo_url : undefined;
    const nameParts = legalName.split(/\s+/).filter(Boolean);
    const identification = isNG ? bvn : idNumber;

    if (nameParts.length < 2) return json({ error: "Enter your first and last name" }, 400);
    if (!dob) return json({ error: "Enter a valid date of birth (you must be 18+)" }, 400);
    if (isNG && !/^[0-9]{11}$/.test(bvn)) return json({ error: "BVN must be 11 digits" }, 400);
    if (!isNG && !/^[A-Za-z0-9-]{5,30}$/.test(idNumber)) return json({ error: "Enter your government ID or passport number" }, 400);
    if (!/^\+\d{1,4}$/.test(phoneCode) || phoneNumber.length < 7 || phoneNumber.length > 12) {
      return json({ error: "Enter a valid phone number" }, 400);
    }
    if (street.length < 5 || !city || !state || !postal) return json({ error: "Enter your full residential address" }, 400);

    // ---- claim the submission atomically (blocks double-submits) ----
    const claim = await admin.from("customer_verifications").update({ status: "pending", submitted_at: new Date().toISOString(), rejection_reason: null })
      .eq("user_id", uid).in("status", ["not_started", "rejected", "additional_info_required"]).select("user_id");
    if (claim.error) throw new Error("claim failed");
    if (!claim.data || claim.data.length === 0) {
      const ins = await admin.from("customer_verifications").insert({ user_id: uid, status: "pending", submitted_at: new Date().toISOString() });
      if (ins.error) return json({ error: "already_pending" }, 409);
    }

    const revert = (status: string, reason: string | null) =>
      admin.from("customer_verifications").update({ status, rejection_reason: reason }).eq("user_id", uid);

    try {
      // ---- tier 0: customer ----
      const pc = await admin.from("provider_customers").select("provider_customer_id").eq("user_id", uid).maybeSingle();
      let customerId = pc.data?.provider_customer_id ?? null;
      if (!customerId) {
        const c = await createCustomer({
          first_name: nameParts[0],
          last_name: nameParts.slice(1).join(" "),
          email: u.user.email ?? "",
          country,
        });
        customerId = c.id;
        await admin.from("provider_customers").upsert({ user_id: uid, provider_customer_id: customerId, tier: 0, status: "tier0_created", last_error: null });
      }

      // ---- tier 1: ID number, DOB, phone, address ----
      await upgradeTier1({
        customer_id: customerId,
        dob: dob.maplerad,
        identification_number: identification,
        phone: { phone_country_code: phoneCode, phone_number: phoneNumber },
        address: { street, street2: null, city, state, country, postal_code: postal },
        ...(photo ? { photo } : {}),
      });
      await admin.from("provider_customers").update({ tier: 1, status: "approved", last_error: null }).eq("user_id", uid);

      // ---- mark verified (the ID number itself is not stored) ----
      await admin.from("customer_verifications").update({
        status: "verified", provider_code: "maplerad", provider_reference: customerId, legal_name: legalName,
        date_of_birth: dob.iso, address_line1: street, city, region: state, postal_code: postal, country_of_residence: country,
        reviewed_at: new Date().toISOString(), rejection_reason: null,
      }).eq("user_id", uid);
      await admin.from("kyc_submissions").insert({
        user_id: uid, tier: 1, id_type: isNG ? "BVN" : "ID", status: "approved",
        ...(isNG ? { bvn_last4: bvn.slice(-4) } : { id_last4: idNumber.slice(-4) }),
      });
    } catch (e) {
      if (e instanceof MapleradError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 429) {
        await admin.from("provider_customers").update({ status: "rejected", last_error: e.message }).eq("user_id", uid);
        await revert("additional_info_required", e.message);
        return json({ status: "additional_info_required", error: e.message }, 422);
      }
      await admin.from("provider_customers").update({ status: "error", last_error: "provider_unavailable" }).eq("user_id", uid);
      await revert("not_started", null);
      return json({ error: "Verification is temporarily unavailable. Please try again shortly." }, 502);
    }

    // Verified. The free home account is issued now; if that fails, calling this function again retries it.
    try {
      const account = await provisionAccount(admin, uid);
      return json({ status: "verified", account });
    } catch (e) {
      console.error("account provisioning failed", safeMessage(e));
      return json({ status: "verified", account: null, notice: "Account is being set up. Please check back shortly." }, 202);
    }
  } catch (e) {
    console.error("kyc-submit failed", safeMessage(e));
    return json({ error: "Request failed" }, 500);
  }
});
