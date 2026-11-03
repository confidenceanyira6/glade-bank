// Data layer for card management.
// FRONTEND PROTOTYPE: mock data + localStorage holding MASKED fields only.
// When the backend exists, replace the bodies of these functions with API calls and keep the signatures.
//
// SECURITY: the full card number and the CVV are only used inside the form to validate input.
// They are never passed to this module, never stored and never logged. Send the backend a
// payment-provider token plus last4/expiry instead. Do not add a `cvv` column to the database.
//
// Record shape (maps onto the planned id / card_number / date / time columns):
//   id, cardNumber (masked, e.g. "•••• •••• •••• 4242"), date (YYYY-MM-DD), time (HH:MM:SS)
//   plus display fields: brand, last4, holder, expMonth, expYear, status, customer, email

const KEY = 'gb_cards_masked';

export const detectBrand = (d) => {
  if (/^4/.test(d)) return 'VISA';
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(d)) return 'Mastercard';
  return null;
};

export const luhn = (n) => {
  let s = 0, dbl = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let x = +n[i];
    if (dbl) { x *= 2; if (x > 9) x -= 9; }
    s += x; dbl = !dbl;
  }
  return n.length > 0 && s % 10 === 0;
};

export const isExpired = (m, y) => {
  const n = new Date();
  return +y < n.getFullYear() || (+y === n.getFullYear() && +m < n.getMonth() + 1);
};

const maskNumber = (last4) => '•••• •••• •••• ' + last4;
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const pad = (n) => String(n).padStart(2, '0');

const MOCK = [
  { id: 'CRD-1001', holder: 'Ada Obi', email: 'ada@example.com', brand: 'VISA', last4: '4242', expMonth: '12', expYear: '2029', date: '2026-10-28', time: '09:14:00', status: 'Active' },
  { id: 'CRD-1002', holder: 'John Smith', email: 'john@example.com', brand: 'Mastercard', last4: '4444', expMonth: '08', expYear: '2028', date: '2026-10-29', time: '14:41:00', status: 'Active' },
  { id: 'CRD-1003', holder: 'Mary Johnson', email: 'mary@example.com', brand: 'VISA', last4: '1881', expMonth: '03', expYear: '2027', date: '2026-10-30', time: '11:05:00', status: 'Blocked' },
  { id: 'CRD-1004', holder: 'Chidi Okafor', email: 'chidi@example.com', brand: 'Mastercard', last4: '8210', expMonth: '09', expYear: '2026', date: '2026-09-14', time: '16:22:00', status: 'Active' },
  { id: 'CRD-1005', holder: 'Amaka Eze', email: 'amaka@example.com', brand: 'VISA', last4: '9025', expMonth: '01', expYear: '2030', date: '2026-11-01', time: '08:30:00', status: 'Active' },
  { id: 'CRD-1006', holder: 'Tunde Bello', email: 'tunde@example.com', brand: 'Mastercard', last4: '6643', expMonth: '05', expYear: '2027', date: '2026-08-03', time: '10:12:00', status: 'Blocked' },
];

const withStatus = (r) => ({
  ...r,
  cardNumber: maskNumber(r.last4),
  status: r.status !== 'Blocked' && isExpired(r.expMonth, r.expYear) ? 'Expired' : r.status,
});

/** Cards saved by the signed-in customer (masked only). */
export async function listMyCards() {
  return read().map(withStatus);
}

/** input: { holder, brand, last4, expMonth, expYear } — nothing sensitive. */
export async function registerCard(input) {
  const cards = read();
  if (cards.some((c) => c.last4 === input.last4 && c.expMonth === input.expMonth && c.expYear === input.expYear && c.brand === input.brand)) {
    return { ok: false, error: 'This card is already added.' };
  }
  const now = new Date();
  const rec = {
    id: 'CRD-' + now.getTime().toString(36).toUpperCase().slice(-6),
    holder: input.holder, brand: input.brand, last4: input.last4,
    expMonth: input.expMonth, expYear: String(input.expYear),
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    email: 'confidence@email.com', status: 'Active', mine: true,
  };
  write([rec, ...cards]);
  return { ok: true, card: withStatus(rec) };
}

export async function removeCard(id) {
  write(read().filter((c) => c.id !== id));
}

/** All customer card records for the admin console (sample data + cards added in this browser). */
export async function listAdminCards() {
  return [...read(), ...MOCK]
    .map(withStatus)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

/** status: 'Active' | 'Blocked' */
export async function setCardStatus(id, status) {
  const cards = read();
  const i = cards.findIndex((c) => c.id === id);
  if (i >= 0) { cards[i].status = status; write(cards); return; }
  const m = MOCK.find((c) => c.id === id);
  if (m) m.status = status;
}

export const fmtDate = (d, t) => {
  const x = new Date(`${d}T${t || '00:00:00'}`);
  return isNaN(x) ? '—' : x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
export const fmtTime = (d, t) => {
  const x = new Date(`${d}T${t || '00:00:00'}`);
  return isNaN(x) ? '—' : x.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};
