// ---------- Brand & demo config (change the name here in one place) ----------
export const BRAND = { name: 'Nexora Bank', word: 'NEXORA', sub: 'BANK', tagline: 'Banking beyond borders, built for you.' };
export const DEMO_PIN = '1234';
export const DEMO_LOGIN = { email: 'demo@nexora.test', password: 'Demo1234' };
export const LOAN_LIMIT = 500000;
export const LOAN_RATE = 0.03; // flat, per month (illustrative)

// Indicative demo rates, value of 1 unit in NGN. NOT live rates.
export const CURRENCIES = {
  NGN: { symbol: '₦', name: 'Nigerian Naira', rate: 1, color: '#22c55e' },
  USD: { symbol: '$', name: 'US Dollar', rate: 1500, color: '#3b82f6' },
  GBP: { symbol: '£', name: 'British Pound', rate: 1950, color: '#ef4444' },
  EUR: { symbol: '€', name: 'Euro', rate: 1650, color: '#6366f1' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', rate: 1100, color: '#f43f5e' },
  GHS: { symbol: 'GH₵', name: 'Ghanaian Cedi', rate: 100, color: '#eab308' },
  KES: { symbol: 'KSh', name: 'Kenyan Shilling', rate: 11.5, color: '#14b8a6' },
  ZAR: { symbol: 'R', name: 'South African Rand', rate: 85, color: '#f97316' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', rate: 1000, color: '#06b6d4' },
};

export const BANKS = ['Access Bank', 'First Bank', 'GTBank', 'Kuda', 'Moniepoint', 'Opay', 'Stanbic IBTC', 'UBA', 'Union Bank', 'Wema Bank', 'Zenith Bank'];

// ok:false simulates a corridor that is not approved yet (see provider_corridors in the backend)
export const COUNTRIES = [
  { code: 'US', name: 'United States', cur: 'USD', ok: true },
  { code: 'GB', name: 'United Kingdom', cur: 'GBP', ok: true },
  { code: 'DE', name: 'Germany', cur: 'EUR', ok: true },
  { code: 'FR', name: 'France', cur: 'EUR', ok: true },
  { code: 'CA', name: 'Canada', cur: 'CAD', ok: true },
  { code: 'GH', name: 'Ghana', cur: 'GHS', ok: true },
  { code: 'KE', name: 'Kenya', cur: 'KES', ok: false },
  { code: 'ZA', name: 'South Africa', cur: 'ZAR', ok: false },
];

export const PURPOSES = ['Family support', 'Education / tuition', 'Business payment', 'Rent / property', 'Gift', 'Other'];

export const PRODUCTS = [
  { id: 'fixed', name: 'Nexora Fixed Income', rate: 12, risk: 'Low', min: 50000 },
  { id: 'mm', name: 'Nexora Money Market', rate: 9.5, risk: 'Low', min: 10000 },
  { id: 'growth', name: 'Nexora Growth Fund', rate: 15, risk: 'High', min: 25000 },
];

export const CAT_COLORS = {
  Shopping: '#a855f7',
  'Food & Drinks': '#c8f43a',
  'Bills & Utilities': '#38bdf8',
  Transport: '#fb923c',
  Entertainment: '#f472b6',
  Transfers: '#818cf8',
  Others: '#94a3b8',
};

export const SPEND_KINDS = ['payment', 'internal', 'bank', 'international', 'card'];

// ---------- helpers ----------
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 10);
export const refNo = () => 'GB' + String(Date.now()).slice(-8) + Math.floor(100 + Math.random() * 900);
export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
export const cleanAmt = (v) => {
  let s = String(v).replace(/[^0-9.]/g, '');
  const i = s.indexOf('.');
  if (i >= 0) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '').slice(0, 2);
  return s;
};

export function fmt(amount, cur = 'NGN', hide = false) {
  const c = CURRENCIES[cur] || CURRENCIES.NGN;
  if (hide) return c.symbol + ' ••••••';
  const n = Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return c.symbol + n;
}
export const toNGN = (amount, cur) => amount * (CURRENCIES[cur] ? CURRENCIES[cur].rate : 1);
export const rateBetween = (from, to) => CURRENCIES[from].rate / CURRENCIES[to].rate;
export const bankFee = (amt) => (amt <= 5000 ? 10 : amt <= 50000 ? 25 : 50);

export const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
export function dayLabel(iso) {
  const d = new Date(iso);
  const t = new Date();
  const y = new Date();
  y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const timeLabel = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const dateTimeLabel = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
export const maskAcct = (n) => '•••• ' + String(n).slice(-4);

export function downloadText(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch (e2) {
      /* ignore */
    }
    ta.remove();
  }
  return true;
}

export function csvOf(txs) {
  const head = ['Date', 'Reference', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Fee', 'Status'];
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = txs.map((t) => [t.date, t.ref, t.type, t.title, t.cat, t.amount, t.currency, t.fee, t.status].map(esc).join(','));
  return [head.join(',')].concat(rows).join('\n');
}

const NAMES = ['Adaeze Nwosu', 'Tunde Bakare', 'Ngozi Okeke', 'Ibrahim Musa', 'Funke Adeyemi', 'Emeka Obi', 'Zainab Bello', 'Kelechi Eze', 'Segun Alade', 'Halima Yusuf'];
export const nameFromAccount = (n) => NAMES[String(n).split('').reduce((a, c) => a + (Number(c) || 0), 0) % NAMES.length];

// Decorative QR-looking pattern. NOT scannable. Real QR comes with the backend.
export function qrMatrix(text, size = 25) {
  let seed = 0;
  for (const c of text) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const m = Array.from({ length: size }, () => Array(size).fill(0));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) m[y][x] = rnd() > 0.5 ? 1 : 0;
  const finder = (ox, oy) => {
    for (let y = -1; y <= 7; y++) {
      for (let x = -1; x <= 7; x++) {
        const X = ox + x;
        const Y = oy + y;
        if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
        const inside = x >= 0 && x <= 6 && y >= 0 && y <= 6;
        const edge = x === 0 || x === 6 || y === 0 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        m[Y][X] = inside && (edge || core) ? 1 : 0;
      }
    }
  };
  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);
  return m;
}

export function spendSummary(txs, days) {
  const since = Date.now() - days * 86400000;
  const byCat = {};
  let spend = 0;
  let income = 0;
  for (const t of txs) {
    if (new Date(t.date).getTime() < since || t.status === 'failed') continue;
    const v = toNGN(t.amount, t.currency);
    if (t.type === 'debit' && SPEND_KINDS.includes(t.kind)) {
      const c = t.cat || 'Others';
      byCat[c] = (byCat[c] || 0) + v;
      spend += v;
    } else if (t.type === 'credit' && (t.kind === 'deposit' || t.kind === 'payment')) {
      income += v;
    }
  }
  return { spend, income, byCat };
}

export function dailySpend(txs, n = 7) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    out.push({ key: d.toDateString(), label: d.toLocaleDateString('en-GB', { weekday: 'short' }).slice(0, 3), value: 0 });
  }
  for (const t of txs) {
    if (t.type !== 'debit' || t.status === 'failed' || !SPEND_KINDS.includes(t.kind)) continue;
    const slot = out.find((o) => o.key === new Date(t.date).toDateString());
    if (slot) slot.value += toNGN(t.amount, t.currency);
  }
  return out;
}
