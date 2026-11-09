// Maplerad REST client.
//
// Paths below come from Maplerad's public docs/reference (maplerad.dev):
//   POST   /customers                    create customer (tier 0)
//   PATCH  /customers/upgrade/tier1      upgrade to tier 1
//   POST   /collections/virtual-account  create NGN virtual (NUBAN) account
// NOT yet confirmed against the sandbox: the auth header scheme (default Bearer), the sandbox base URL, and the
// exact response shapes (parsed defensively in pick()). Confirm each one with your first sandbox calls.
//
// Secrets (supabase secrets set ...): MAPLERAD_SECRET_KEY, MAPLERAD_BASE_URL, optional MAPLERAD_AUTH_SCHEME.

export class MapleradError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function mapleradConfigured(): boolean {
  return !!Deno.env.get("MAPLERAD_SECRET_KEY") && !!Deno.env.get("MAPLERAD_BASE_URL");
}

// deno-lint-ignore no-explicit-any
type Json = any;

async function call(method: string, path: string, body?: unknown): Promise<Json> {
  const base = (Deno.env.get("MAPLERAD_BASE_URL") ?? "").replace(/\/+$/, "");
  const key = Deno.env.get("MAPLERAD_SECRET_KEY") ?? "";
  const scheme = Deno.env.get("MAPLERAD_AUTH_SCHEME") ?? "Bearer";
  let res: Response;
  try {
    res = await fetch(base + path, {
      method,
      headers: { Authorization: `${scheme} ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    console.error("maplerad network error", method, path);
    throw new MapleradError("Banking partner unreachable", 0);
  }
  const text = await res.text();
  let json: Json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  if (!res.ok) {
    // Never log request bodies (PII) or the key.
    console.error("maplerad error", method, path, res.status);
    const msg = typeof json?.message === "string" ? json.message.slice(0, 200) : "Banking partner rejected the request";
    throw new MapleradError(msg, res.status);
  }
  return json;
}

/** First defined value among several possible response paths. */
function pick(obj: Json, ...paths: string[]): unknown {
  for (const p of paths) {
    let cur = obj;
    for (const k of p.split(".")) cur = cur?.[k];
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

export async function createCustomer(i: { first_name: string; last_name: string; email: string; country: string }) {
  const r = await call("POST", "/customers", i);
  const id = pick(r, "data.id", "data.customer_id", "id");
  if (typeof id !== "string") throw new MapleradError("Unexpected response creating customer", 502);
  return { id };
}

export async function upgradeTier1(i: {
  customer_id: string;
  dob: string; // DD-MM-YYYY per Maplerad docs
  identification_number: string; // BVN
  phone: { phone_country_code: string; phone_number: string };
  address: { street: string; street2: string | null; city: string; state: string; country: string; postal_code: string };
  photo?: string;
}) {
  await call("PATCH", "/customers/upgrade/tier1", i);
}

export async function createNgnVirtualAccount(customer_id: string, preferred_bank?: string) {
  const r = await call("POST", "/collections/virtual-account", {
    customer_id,
    currency: "NGN",
    ...(preferred_bank ? { preferred_bank } : {}),
  });
  const account_number = pick(r, "data.account_number", "data.accountNumber", "account_number");
  const bank_name = pick(r, "data.bank_name", "data.bankName", "bank_name");
  const reference = pick(r, "data.id", "data.reference", "id");
  if (typeof account_number !== "string" || !/^[0-9]{6,20}$/.test(account_number)) {
    throw new MapleradError("Unexpected response creating virtual account", 502);
  }
  return {
    account_number,
    bank_name: typeof bank_name === "string" ? bank_name : null,
    reference: typeof reference === "string" ? reference : null,
  };
}
