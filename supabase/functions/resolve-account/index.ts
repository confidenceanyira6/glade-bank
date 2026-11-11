// resolve-account: name enquiry for accounts at OTHER banks (Glade Bank accounts use the lookup_account RPC).
// Needs the secret PAYSTACK_SECRET_KEY (Supabase > Edge Functions > Secrets). Logged-in users only (verify_jwt).
// If the user already picked a bank, only that bank is checked. If not, we work out the likely banks
// (NUBAN check digit + the phone-number fintech banks) and return every match so the app can auto-fill.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Paystack bank codes
const BANKS: Record<string, string> = {
  '044': 'Access Bank', '058': 'GTBank', '057': 'Zenith Bank', '011': 'First Bank', '033': 'UBA',
  '035': 'Wema Bank', '232': 'Sterling Bank', '070': 'Fidelity Bank', '032': 'Union Bank', '221': 'Stanbic IBTC',
  '50211': 'Kuda', '50515': 'Moniepoint', '999992': 'OPay', '999991': 'PalmPay',
};
const TRAD = ['044', '058', '057', '011', '033', '035', '232', '070', '032', '221'];
const FINTECH = ['999992', '999991', '50515', '50211'];

// NUBAN check digit: weights 3,7,3,3,7,3,3,7,3,3,7,3 over bank code + first 9 digits
function nubanOk(code: string, acct: string) {
  const w = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];
  const sum = (code + acct.slice(0, 9)).split('').reduce((a, d, i) => a + Number(d) * w[i], 0);
  return (10 - (sum % 10)) % 10 === Number(acct[9]);
}

async function resolve(key: string, acct: string, code: string) {
  const r = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${acct}&bank_code=${code}`,
    { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) },
  );
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.status || !j?.data?.account_name) return null;
  return { bank_code: code, bank_name: BANKS[code] ?? code, name: String(j.data.account_name) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const key = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!key) return json({ ok: false, error: 'not_configured' });

  const body = await req.json().catch(() => ({}));
  const acct = String(body.account_number ?? '');
  const given = body.bank_code ? String(body.bank_code) : '';
  if (!/^\d{10}$/.test(acct)) return json({ ok: false, error: 'bad_account_number' }, 400);
  if (given && !/^\d{2,6}$/.test(given)) return json({ ok: false, error: 'bad_bank_code' }, 400);

  const candidates = given ? [given] : [...TRAD.filter((c) => nubanOk(c, acct)), ...FINTECH];
  const settled = await Promise.allSettled(candidates.map((c) => resolve(key, acct, c)));
  const matches = settled
    .map((s) => (s.status === 'fulfilled' ? s.value : null))
    .filter((m): m is NonNullable<typeof m> => !!m);

  if (!matches.length) return json({ ok: false, error: 'not_found' });
  return json({ ok: true, matches });
});
