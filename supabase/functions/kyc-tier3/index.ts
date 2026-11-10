// POST /functions/v1/kyc-tier3   (JWT required)
// Glade level 3 = NIN + government ID. Requires level 2 (BVN-verified, has a Maplerad customer). Nigeria only for now.
// Calls Maplerad's tier 2 upgrade (path/body UNCONFIRMED, see maplerad_client.ts). The NIN and ID number are forwarded and
// never stored; only the last 4 digits are kept for audit. A failure changes nothing: the user stays at level 2.
import { adminClient, json, safeMessage, userClient } from "../_shared/util.ts";
import { mapleradConfigured, MapleradError, upgradeTier2 } from "../_shared/maplerad_client.ts";

const ID_TYPES = ["National ID (NIN slip)", "Driver's licence", "International passport", "Voter's card"];

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const u = await userClient(req);
  if (!u) return json({ error: "unauthorized" }, 401);
  if (!mapleradConfigured()) return json({ error: "provider_not_configured" }, 503);

  const admin = adminClient();
  const uid = u.user.id;
  try {
    const ver = await admin.from("customer_verifications").select("status,kyc_tier,country_of_residence").eq("user_id", uid).maybeSingle();
    if (ver.data?.status !== "verified") return json({ error: "Complete Level 2 (BVN) first" }, 403);
    if ((ver.data?.kyc_tier ?? 2) >= 3) return json({ status: "verified", tier: 3 });
    if (String(ver.data?.country_of_residence ?? "NG").toUpperCase() !== "NG") {
      return json({ error: "Level 3 is not available in your country yet" }, 422);
    }

    // deno-lint-ignore no-explicit-any
    let b: any;
    try { b = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const nin = String(b.nin ?? "");
    const idType = String(b.id_type ?? "");
    const idNumber = String(b.id_number ?? "").trim();
    const image = typeof b.id_image_url === "string" && b.id_image_url.startsWith("https://") ? b.id_image_url : undefined;
    if (!/^[0-9]{11}$/.test(nin)) return json({ error: "NIN must be 11 digits" }, 400);
    if (!ID_TYPES.includes(idType)) return json({ error: "Choose an ID type" }, 400);
    if (!/^[A-Za-z0-9-]{5,30}$/.test(idNumber)) return json({ error: "Enter your ID number" }, 400);

    const pc = await admin.from("provider_customers").select("provider_customer_id").eq("user_id", uid).maybeSingle();
    const customerId = pc.data?.provider_customer_id;
    if (!customerId) return json({ error: "Your verification is not linked to our banking partner yet" }, 409);

    try {
      await upgradeTier2({ customer_id: customerId, identity: { type: "NIN", number: nin, country: "NG", ...(image ? { image } : {}) } });
    } catch (e) {
      if (e instanceof MapleradError && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403 && e.status !== 429) {
        return json({ error: e.message }, 422);
      }
      return json({ error: "Level 3 verification is temporarily unavailable. Please try again shortly." }, 502);
    }

    await admin.from("customer_verifications").update({ kyc_tier: 3 }).eq("user_id", uid);
    await admin.from("provider_customers").update({ tier: 2 }).eq("user_id", uid);
    await admin.from("kyc_submissions").insert({ user_id: uid, tier: 3, id_type: idType, id_last4: idNumber.slice(-4), nin_last4: nin.slice(-4), status: "approved" });
    return json({ status: "verified", tier: 3 });
  } catch (e) {
    console.error("kyc-tier3 failed", safeMessage(e));
    return json({ error: "Request failed" }, 500);
  }
});
