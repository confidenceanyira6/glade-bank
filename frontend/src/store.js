// =============================================================================
// MOCK BACKEND. Everything here runs in the browser and saves to localStorage.
// Each function in `api` maps to a real Supabase call later (see frontend/README.md).
// DEMO ONLY: never store passwords client-side in the real app. Supabase Auth does that.
// =============================================================================
import { useSyncExternalStore } from 'react';
import { BRAND, CURRENCIES, DEMO_PIN, LOAN_LIMIT, LOAN_RATE, PRODUCTS, uid, refNo, sleep, toNGN, rateBetween, isToday, fmt, nameFromAccount } from './lib.js';

const KEY = 'nexora_demo_v1';
export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
// transient, non-persisted hand-off between screens
export const ui = { draft: null, fromId: null, prefill: null };

const round2 = (n) => Math.round(n * 100) / 100;
const genAcct = () => '30' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0');

const DEMO_USER = { id: 'usr_demo', name: 'Confidence Anyira', email: 'demo@nexora.test', phone: '+2348012345678', password: 'Demo1234', pin: DEMO_PIN, verified: 'unverified' };

function base() {
  return {
    users: [DEMO_USER],
    session: null,
    onboarded: false,
    ownerId: null,
    accounts: [],
    transactions: [],
    beneficiaries: [],
    cards: [],
    goals: [],
    loans: [],
    holdings: [],
    tickets: [],
    chat: [],
    settings: { hideBalance: false, push: true, email: true, txAlerts: true, biometrics: false, twoFA: false, dailyLimit: 5000000 },
    dev: { slow: false, fail: false },
  };
}

function seedData(user) {
  const now = Date.now();
  const day = 86400000;
  const at = (d, h = 0) => new Date(now - d * day - h * 3600000).toISOString();
  const accounts = [
    ['NGN', 1507500, '0012345678'],
    ['USD', 250, '3012345601'],
    ['GBP', 150, '3012345602'],
    ['EUR', 100, '3012345603'],
    ['CAD', 100, '3012345604'],
  ].map(([cur, balance, number]) => ({ id: 'acc_' + cur.toLowerCase(), currency: cur, name: CURRENCIES[cur].name + ' Account', number, balance, status: 'active' }));

  // [daysAgo, title, category, amount, type, currency, kind]
  const S = [
    [0, 'Jumia Online Shopping', 'Shopping', 45000, 'debit', 'NGN', 'payment'],
    [1, 'Chicken Republic', 'Food & Drinks', 8500, 'debit', 'NGN', 'payment'],
    [1, 'Uber Ride', 'Transport', 6200, 'debit', 'NGN', 'payment'],
    [2, 'DSTV Subscription', 'Bills & Utilities', 24500, 'debit', 'NGN', 'payment'],
    [3, 'Salary - Acme Ltd', 'Income', 450000, 'credit', 'NGN', 'deposit'],
    [4, 'Netflix', 'Entertainment', 5500, 'debit', 'NGN', 'payment'],
    [5, 'Transfer from Chidi Okafor', 'Income', 75000, 'credit', 'NGN', 'deposit'],
    [6, 'Ikeja Electric', 'Bills & Utilities', 18000, 'debit', 'NGN', 'payment'],
    [7, 'Shoprite', 'Shopping', 32800, 'debit', 'NGN', 'payment'],
    [8, 'Bolt Ride', 'Transport', 4300, 'debit', 'NGN', 'payment'],
    [9, "Domino's Pizza", 'Food & Drinks', 12400, 'debit', 'NGN', 'payment'],
    [11, 'Transfer to Amaka Eze', 'Transfers', 50000, 'debit', 'NGN', 'internal'],
    [12, 'Spotify', 'Entertainment', 1900, 'debit', 'NGN', 'payment'],
    [14, 'Client payment - Upwork', 'Income', 80, 'credit', 'USD', 'deposit'],
    [16, 'MTN Airtime', 'Bills & Utilities', 5000, 'debit', 'NGN', 'payment'],
    [18, 'Amazon', 'Shopping', 35, 'debit', 'USD', 'payment'],
    [22, 'Transfer to David Johnson', 'Transfers', 60000, 'debit', 'NGN', 'bank'],
  ];
  const transactions = S.map(([d, title, cat, amount, type, cur, kind], i) => ({
    id: 'tx_seed' + i,
    ref: 'GB' + (70000000 + i * 137),
    type,
    cat,
    title,
    sub: cat,
    amount,
    fee: 0,
    currency: cur,
    accountId: 'acc_' + cur.toLowerCase(),
    date: at(d, i % 5),
    status: 'completed',
    kind,
    note: '',
    history: [{ status: 'completed', at: at(d, i % 5) }],
  }));

  return {
    ownerId: user.id,
    accounts,
    transactions,
    beneficiaries: [
      { id: 'ben_1', name: 'Amaka Eze', bank: BRAND.name, number: '0098765432', type: 'internal', fav: true },
      { id: 'ben_2', name: 'David Johnson', bank: 'Zenith Bank', number: '2012345678', type: 'bank', fav: true },
      { id: 'ben_3', name: 'Chidi Okafor', bank: 'GTBank', number: '0123456789', type: 'bank', fav: false },
      { id: 'ben_4', name: 'Emily Watson', bank: 'Chase Bank', number: 'US12345678901', type: 'international', country: 'US', swift: 'CHASUS33', currency: 'USD', fav: false },
      { id: 'ben_5', name: 'Sarah Williams', bank: 'Barclays', number: 'GB29NWBK60161331926819', type: 'international', country: 'GB', swift: 'BARCGB22', currency: 'GBP', fav: false },
    ],
    cards: [
      { id: 'card_1', brand: 'VISA', type: 'Virtual', number: '4000 1234 5678 4242', last4: '4242', cvv: '123', expiry: '09/29', frozen: false, limit: 500000, spent: 128400, online: true, intl: true, atm: false, contactless: true },
    ],
    goals: [
      { id: 'goal_1', name: 'New Car', target: 2000000, saved: 1500000 },
      { id: 'goal_2', name: 'Emergency Fund', target: 1000000, saved: 400000 },
      { id: 'goal_3', name: 'Vacation', target: 600000, saved: 150000 },
    ],
    loans: [],
    holdings: [
      { id: 'inv_1', productId: 'fixed', name: 'Nexora Fixed Income', rate: 12, amount: 900000, value: 1000000 },
      { id: 'inv_2', productId: 'growth', name: 'Nexora Growth Fund', rate: 15, amount: 400000, value: 500000 },
    ],
    tickets: [
      { id: 'TKT-1001', subject: 'Card not working online', category: 'Cards', status: 'resolved', createdAt: at(9), messages: [{ from: 'user', text: 'My virtual card was declined on a website.', at: at(9) }, { from: 'agent', text: 'Online payments were switched off on the card. We have switched them on. Please try again.', at: at(9, -1) }] },
    ],
    chat: [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...base(), ...JSON.parse(raw) };
  } catch (e) {
    /* ignore */
  }
  return base();
}

let state = load();
const listeners = new Set();
function set(fn) {
  state = fn(state);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* ignore */
  }
  listeners.forEach((l) => l());
}
export const store = {
  get: () => state,
  update: set,
  subscribe: (l) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
export function useStore() {
  return useSyncExternalStore(store.subscribe, store.get);
}
export const me = (s = state) => s.users.find((u) => u.id === s.session) || null;

async function net() {
  await sleep(state.dev.slow ? 2500 : 400);
  if (state.dev.fail) throw new ApiError('network_error', 'Network error (simulated). Turn off "Simulate network failure" in Test Lab.');
}
const need = (cond, code, msg) => {
  if (!cond) throw new ApiError(code, msg);
};
const acc = (id) => state.accounts.find((a) => a.id === id);
function makeTx(o) {
  const at = new Date().toISOString();
  return { id: uid('tx'), ref: refNo(), fee: 0, status: 'completed', date: at, note: '', history: [{ status: o.status || 'completed', at }], ...o };
}
const bump = (s, id, delta) => s.accounts.map((a) => (a.id === id ? { ...a, balance: round2(a.balance + delta) } : a));
const patchUser = (s, patch) => s.users.map((u) => (u.id === s.session ? { ...u, ...patch } : u));

function agentReply(ticketId) {
  setTimeout(() => {
    set((s) => ({
      ...s,
      tickets: s.tickets.map((t) =>
        t.id === ticketId
          ? { ...t, status: t.status === 'resolved' ? 'open' : 'in_progress', messages: [...t.messages, { from: 'agent', text: 'Thanks for reaching out. This is an automated demo reply. In production a support agent will answer here.', at: new Date().toISOString() }] }
          : t
      ),
    }));
  }, 2000);
}

export const api = {
  // ---------- auth ----------
  async register({ name, email, phone, password }) {
    await net();
    const e = email.trim().toLowerCase();
    need(!state.users.some((u) => u.email === e), 'email_exists', 'An account with this email already exists.');
    const user = { id: uid('usr'), name: name.trim(), email: e, phone: phone.trim(), password, pin: DEMO_PIN, verified: 'unverified' };
    set((s) => ({ ...s, users: [...s.users, user], session: user.id, ...seedData(user), settings: base().settings }));
  },
  async login({ id, password }) {
    await net();
    const key = id.trim().toLowerCase();
    const u = state.users.find((x) => x.email === key || x.phone === id.trim());
    need(u && u.password === password, 'invalid_credentials', 'Incorrect email/phone or password.');
    set((s) => ({ ...s, session: u.id, ...(s.ownerId !== u.id ? seedData(u) : {}) }));
  },
  logout() {
    set((s) => ({ ...s, session: null }));
  },
  completeOnboarding() {
    set((s) => ({ ...s, onboarded: true }));
  },

  // ---------- profile & verification ----------
  async updateProfile({ name, phone }) {
    await net();
    set((s) => ({ ...s, users: patchUser(s, { name: name.trim(), phone: phone.trim() }) }));
  },
  async changePin({ current, next }) {
    await net();
    need(current === me().pin, 'invalid_pin', 'Current PIN is incorrect.');
    need(/^\d{4}$/.test(next), 'invalid_pin', 'New PIN must be 4 digits.');
    set((s) => ({ ...s, users: patchUser(s, { pin: next }) }));
  },
  async submitVerification({ idType, idNumber }) {
    await net();
    need(idNumber.trim().length >= 6, 'invalid_id', 'Enter a valid ID number (at least 6 characters).');
    set((s) => ({ ...s, users: patchUser(s, { verified: 'pending', idType }) }));
  },
  async approveVerification() {
    await net(); // demo_complete_verification
    set((s) => ({ ...s, users: patchUser(s, { verified: 'verified' }) }));
  },
  setVerification(status) {
    set((s) => ({ ...s, users: patchUser(s, { verified: status }) }));
  },
  updateSettings(patch) {
    set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },

  // ---------- accounts ----------
  async addAccount(cur) {
    await net();
    need(!state.accounts.some((a) => a.currency === cur), 'exists', 'You already have this account.');
    const a = { id: 'acc_' + cur.toLowerCase(), currency: cur, name: CURRENCIES[cur].name + ' Account', number: genAcct(), balance: 0, status: 'active' };
    set((s) => ({ ...s, accounts: [...s.accounts, a] }));
  },
  async addFunds({ accountId, amount }) {
    await net(); // demo_add_funds
    const a = acc(accountId);
    need(a, 'not_found', 'Account not found.');
    const tx = makeTx({ type: 'credit', cat: 'Income', kind: 'deposit', title: 'Demo top-up', sub: 'Test funds', amount, currency: a.currency, accountId: a.id });
    set((s) => ({ ...s, accounts: bump(s, a.id, amount), transactions: [tx, ...s.transactions] }));
  },
  async simulateIncoming(accountId) {
    await net();
    const a = acc(accountId);
    need(a, 'not_found', 'Account not found.');
    const names = ['Tunde Bakare', 'Ngozi Okeke', 'Emily Watson', 'Kelechi Eze', 'Zainab Bello'];
    const from = names[Math.floor(Math.random() * names.length)];
    const amount = a.currency === 'NGN' ? (Math.floor(Math.random() * 20) + 1) * 5000 : (Math.floor(Math.random() * 10) + 1) * 25;
    const tx = makeTx({ type: 'credit', cat: 'Income', kind: 'deposit', title: 'Transfer from ' + from, sub: 'Incoming payment', amount, currency: a.currency, accountId: a.id, counterparty: { name: from } });
    set((s) => ({ ...s, accounts: bump(s, a.id, amount), transactions: [tx, ...s.transactions] }));
    return tx;
  },
  async convert({ fromId, toId, amount }) {
    await net();
    const a = acc(fromId);
    const b = acc(toId);
    need(a && b && a.id !== b.id, 'invalid_accounts', 'Choose two different accounts.');
    need(amount > 0, 'invalid_amount', 'Enter an amount.');
    need(amount <= a.balance, 'insufficient_funds', 'Insufficient balance. Available: ' + fmt(a.balance, a.currency));
    const rate = rateBetween(a.currency, b.currency) * 0.995;
    const got = round2(amount * rate);
    const t1 = makeTx({ type: 'debit', cat: 'Conversion', kind: 'convert', title: 'Converted ' + a.currency + ' to ' + b.currency, sub: 'Currency exchange', amount, currency: a.currency, accountId: a.id });
    const t2 = makeTx({ type: 'credit', cat: 'Conversion', kind: 'convert', title: 'Converted ' + a.currency + ' to ' + b.currency, sub: 'Currency exchange', amount: got, currency: b.currency, accountId: b.id });
    set((s) => ({
      ...s,
      accounts: s.accounts.map((x) => (x.id === a.id ? { ...x, balance: round2(x.balance - amount) } : x.id === b.id ? { ...x, balance: round2(x.balance + got) } : x)),
      transactions: [t2, t1, ...s.transactions],
    }));
    return { got, rate };
  },

  // ---------- transfers ----------
  async lookup({ number }) {
    await net();
    need(/^\d{10}$/.test(number), 'invalid_account', 'Account number must be 10 digits.');
    need(!number.endsWith('0000'), 'account_not_found', 'Account not found. Check the number and try again.');
    need(!state.accounts.some((a) => a.number === number), 'self_transfer', 'That is one of your own accounts. Use Convert instead.');
    return { name: nameFromAccount(number) };
  },
  async submitTransfer(d, pin) {
    await net();
    const u = me();
    need(pin === u.pin, 'invalid_pin', 'Incorrect PIN. (Demo PIN is ' + DEMO_PIN + ')');
    const a = acc(d.fromId);
    need(a, 'not_found', 'Source account not found.');
    need(d.amount > 0, 'invalid_amount', 'Invalid amount.');
    need(d.kind !== 'international' || u.verified === 'verified', 'verification_required', 'Verify your identity before sending internationally.');
    const total = round2(d.amount + d.fee);
    need(total <= a.balance, 'insufficient_funds', 'Insufficient balance. Available: ' + fmt(a.balance, a.currency));
    const limit = u.verified === 'verified' ? state.settings.dailyLimit : 200000;
    const today = state.transactions
      .filter((t) => t.type === 'debit' && ['internal', 'bank', 'international'].includes(t.kind) && t.status !== 'failed' && isToday(t.date))
      .reduce((sum, t) => sum + toNGN(t.amount, t.currency), 0);
    need(today + toNGN(d.amount, a.currency) <= limit, 'limit_exceeded', 'This is above your daily transfer limit of ' + fmt(limit) + '.' + (u.verified !== 'verified' ? ' Verify your identity to raise it.' : ''));
    const now = new Date().toISOString();
    const intl = d.kind === 'international';
    const tx = makeTx({
      type: 'debit',
      cat: 'Transfers',
      kind: d.kind,
      title: 'Transfer to ' + d.recipient.name,
      sub: d.kind === 'internal' ? BRAND.name : d.recipient.bank,
      amount: d.amount,
      fee: d.fee,
      currency: a.currency,
      accountId: a.id,
      counterparty: d.recipient,
      note: d.note || '',
      status: intl ? 'processing' : 'completed',
      history: intl ? [{ status: 'submitted', at: now }, { status: 'processing', at: now }] : [{ status: 'completed', at: now }],
      extra: intl ? { toAmount: d.toAmount, toCurrency: d.toCurrency, rate: d.rate, purpose: d.purpose } : null,
    });
    const exists = state.beneficiaries.some((b) => b.number === d.recipient.number && b.bank === d.recipient.bank);
    const ben = d.saveBeneficiary && !exists ? { id: uid('ben'), name: d.recipient.name, bank: d.recipient.bank, number: d.recipient.number, type: d.kind, country: d.recipient.country, swift: d.recipient.swift, currency: d.toCurrency, fav: false } : null;
    set((s) => ({ ...s, accounts: bump(s, a.id, -total), transactions: [tx, ...s.transactions], beneficiaries: ben ? [...s.beneficiaries, ben] : s.beneficiaries }));
    return tx;
  },
  async settleTransfer(txId) {
    await net(); // demo_settle_transfer
    const now = new Date().toISOString();
    set((s) => ({ ...s, transactions: s.transactions.map((t) => (t.id === txId && t.status === 'processing' ? { ...t, status: 'completed', history: [...t.history, { status: 'completed', at: now }] } : t)) }));
  },
  async failTransfer(txId) {
    await net();
    const t = state.transactions.find((x) => x.id === txId);
    need(t && t.status === 'processing', 'invalid_state', 'Only processing transfers can fail.');
    const now = new Date().toISOString();
    set((s) => ({
      ...s,
      accounts: bump(s, t.accountId, round2(t.amount + t.fee)),
      transactions: s.transactions.map((x) => (x.id === txId ? { ...x, status: 'failed', history: [...x.history, { status: 'failed', at: now }, { status: 'refunded', at: now }] } : x)),
    }));
  },

  // ---------- beneficiaries ----------
  async addBeneficiary(b) {
    await net();
    need(!state.beneficiaries.some((x) => x.number === b.number && x.bank === b.bank), 'exists', 'This beneficiary already exists.');
    set((s) => ({ ...s, beneficiaries: [...s.beneficiaries, { id: uid('ben'), fav: false, ...b }] }));
  },
  async removeBeneficiary(id) {
    await net();
    set((s) => ({ ...s, beneficiaries: s.beneficiaries.filter((b) => b.id !== id) }));
  },
  toggleFav(id) {
    set((s) => ({ ...s, beneficiaries: s.beneficiaries.map((b) => (b.id === id ? { ...b, fav: !b.fav } : b)) }));
  },

  // ---------- cards ----------
  updateCard(id, patch) {
    set((s) => ({ ...s, cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  async addCard() {
    await net();
    need(state.cards.length < 3, 'limit', 'You can have up to 3 virtual cards.');
    const last4 = String(Math.floor(1000 + Math.random() * 9000));
    const c = { id: uid('card'), brand: 'VISA', type: 'Virtual', number: '4000 ' + String(Math.floor(1000 + Math.random() * 9000)) + ' ' + String(Math.floor(1000 + Math.random() * 9000)) + ' ' + last4, last4, cvv: String(Math.floor(100 + Math.random() * 900)), expiry: '11/29', frozen: false, limit: 200000, spent: 0, online: true, intl: false, atm: false, contactless: true };
    set((s) => ({ ...s, cards: [...s.cards, c] }));
    return c;
  },
  async removeCard(id) {
    await net();
    set((s) => ({ ...s, cards: s.cards.filter((c) => c.id !== id) }));
  },

  // ---------- savings ----------
  async createGoal({ name, target }) {
    await net();
    need(name.trim().length >= 2, 'invalid', 'Give your goal a name.');
    need(target > 0, 'invalid', 'Enter a target amount.');
    set((s) => ({ ...s, goals: [...s.goals, { id: uid('goal'), name: name.trim(), target, saved: 0 }] }));
  },
  async fundGoal({ id, amount }) {
    await net();
    const a = acc('acc_ngn');
    const g = state.goals.find((x) => x.id === id);
    need(g, 'not_found', 'Goal not found.');
    need(amount > 0, 'invalid_amount', 'Enter an amount.');
    need(amount <= a.balance, 'insufficient_funds', 'Insufficient balance. Available: ' + fmt(a.balance));
    const tx = makeTx({ type: 'debit', cat: 'Savings', kind: 'savings', title: 'Saved to ' + g.name, sub: 'Savings goal', amount, currency: 'NGN', accountId: a.id });
    set((s) => ({ ...s, accounts: bump(s, a.id, -amount), goals: s.goals.map((x) => (x.id === id ? { ...x, saved: round2(x.saved + amount) } : x)), transactions: [tx, ...s.transactions] }));
  },
  async withdrawGoal({ id, amount }) {
    await net();
    const g = state.goals.find((x) => x.id === id);
    need(g, 'not_found', 'Goal not found.');
    need(amount > 0, 'invalid_amount', 'Enter an amount.');
    need(amount <= g.saved, 'insufficient_funds', 'You only have ' + fmt(g.saved) + ' saved in this goal.');
    const tx = makeTx({ type: 'credit', cat: 'Savings', kind: 'savings', title: 'Withdrawn from ' + g.name, sub: 'Savings goal', amount, currency: 'NGN', accountId: 'acc_ngn' });
    set((s) => ({ ...s, accounts: bump(s, 'acc_ngn', amount), goals: s.goals.map((x) => (x.id === id ? { ...x, saved: round2(x.saved - amount) } : x)), transactions: [tx, ...s.transactions] }));
  },
  async deleteGoal(id) {
    await net();
    const g = state.goals.find((x) => x.id === id);
    need(g, 'not_found', 'Goal not found.');
    const tx = g.saved > 0 ? makeTx({ type: 'credit', cat: 'Savings', kind: 'savings', title: 'Closed goal: ' + g.name, sub: 'Savings returned', amount: g.saved, currency: 'NGN', accountId: 'acc_ngn' }) : null;
    set((s) => ({ ...s, accounts: g.saved > 0 ? bump(s, 'acc_ngn', g.saved) : s.accounts, goals: s.goals.filter((x) => x.id !== id), transactions: tx ? [tx, ...s.transactions] : s.transactions }));
  },

  // ---------- loans (illustrative) ----------
  async applyLoan({ amount, months }) {
    await net();
    need(me().verified === 'verified', 'verification_required', 'Verify your identity to apply for a loan.');
    need(amount >= 10000, 'invalid_amount', 'Minimum loan is ' + fmt(10000) + '.');
    const used = state.loans.filter((l) => l.status === 'active').reduce((t, l) => t + l.principal, 0);
    need(used + amount <= LOAN_LIMIT, 'limit_exceeded', 'That is above your available loan limit.');
    const interest = round2(amount * LOAN_RATE * months);
    const total = round2(amount + interest);
    const loan = { id: uid('loan'), principal: amount, months, interest, total, monthly: round2(total / months), paid: 0, status: 'active', createdAt: new Date().toISOString() };
    const tx = makeTx({ type: 'credit', cat: 'Loan', kind: 'loan', title: 'Loan disbursement', sub: 'Personal loan', amount, currency: 'NGN', accountId: 'acc_ngn' });
    set((s) => ({ ...s, loans: [loan, ...s.loans], accounts: bump(s, 'acc_ngn', amount), transactions: [tx, ...s.transactions] }));
  },
  async repayLoan(id) {
    await net();
    const l = state.loans.find((x) => x.id === id);
    need(l && l.status === 'active', 'not_found', 'Loan not found.');
    const pay = Math.min(l.monthly, round2(l.total - l.paid));
    const a = acc('acc_ngn');
    need(pay <= a.balance, 'insufficient_funds', 'Insufficient balance. Available: ' + fmt(a.balance));
    const paid = round2(l.paid + pay);
    const tx = makeTx({ type: 'debit', cat: 'Loan', kind: 'loan', title: 'Loan repayment', sub: 'Personal loan', amount: pay, currency: 'NGN', accountId: a.id });
    set((s) => ({ ...s, accounts: bump(s, a.id, -pay), loans: s.loans.map((x) => (x.id === id ? { ...x, paid, status: paid >= x.total ? 'closed' : 'active' } : x)), transactions: [tx, ...s.transactions] }));
  },

  // ---------- investments (illustrative) ----------
  async invest({ productId, amount }) {
    await net();
    const p = PRODUCTS.find((x) => x.id === productId);
    need(p, 'not_found', 'Choose a product.');
    need(amount >= p.min, 'invalid_amount', 'Minimum for this product is ' + fmt(p.min) + '.');
    const a = acc('acc_ngn');
    need(amount <= a.balance, 'insufficient_funds', 'Insufficient balance. Available: ' + fmt(a.balance));
    const h = { id: uid('inv'), productId: p.id, name: p.name, rate: p.rate, amount, value: amount };
    const tx = makeTx({ type: 'debit', cat: 'Investment', kind: 'invest', title: 'Invested in ' + p.name, sub: 'Investment', amount, currency: 'NGN', accountId: a.id });
    set((s) => ({ ...s, accounts: bump(s, a.id, -amount), holdings: [h, ...s.holdings], transactions: [tx, ...s.transactions] }));
  },
  async redeem(id) {
    await net();
    const h = state.holdings.find((x) => x.id === id);
    need(h, 'not_found', 'Holding not found.');
    const tx = makeTx({ type: 'credit', cat: 'Investment', kind: 'invest', title: 'Redeemed ' + h.name, sub: 'Investment', amount: h.value, currency: 'NGN', accountId: 'acc_ngn' });
    set((s) => ({ ...s, accounts: bump(s, 'acc_ngn', h.value), holdings: s.holdings.filter((x) => x.id !== id), transactions: [tx, ...s.transactions] }));
  },

  // ---------- support ----------
  async createTicket({ subject, category, message }) {
    await net();
    need(subject.trim().length >= 3, 'invalid', 'Add a short subject.');
    need(message.trim().length >= 5, 'invalid', 'Describe the problem a little more.');
    const now = new Date().toISOString();
    const t = { id: 'TKT-' + (1000 + state.tickets.length + 1), subject: subject.trim(), category, status: 'open', createdAt: now, messages: [{ from: 'user', text: message.trim(), at: now }] };
    set((s) => ({ ...s, tickets: [t, ...s.tickets] }));
    agentReply(t.id);
    return t;
  },
  replyTicket(id, text) {
    const now = new Date().toISOString();
    set((s) => ({ ...s, tickets: s.tickets.map((t) => (t.id === id ? { ...t, messages: [...t.messages, { from: 'user', text, at: now }] } : t)) }));
    agentReply(id);
  },

  // ---------- test lab ----------
  setDev(patch) {
    set((s) => ({ ...s, dev: { ...s.dev, ...patch } }));
  },
  resetDemoData() {
    set((s) => ({ ...s, ...seedData(me(s)), settings: base().settings }));
  },
  resetAll() {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
    state = base();
    listeners.forEach((l) => l());
  },
};
