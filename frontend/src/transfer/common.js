import { supabase } from '../auth/supabase.js';

export const CUR = {
  NGN: { flag: '🇳🇬', country: 'Nigeria', name: 'Nigerian Naira', sym: '₦' },
  GBP: { flag: '🇬🇧', country: 'United Kingdom', name: 'British Pound', sym: '£' },
  USD: { flag: '🇺🇸', country: 'United States', name: 'US Dollar', sym: '$' },
  EUR: { flag: '🇪🇺', country: 'Eurozone', name: 'Euro', sym: '€' },
  CAD: { flag: '🇨🇦', country: 'Canada', name: 'Canadian Dollar', sym: 'C$' },
};
export const ORDER = ['NGN', 'GBP', 'USD', 'EUR', 'CAD'];

// Licensed partner institution behind each currency account. Shown to customers as "Provided by ...".
// Leave '' until the partner confirms its name and branding in writing. Nothing is shown while empty.
export const PARTNER = { NGN: '', GBP: '', USD: '', EUR: '', CAD: '' };

// Countries Maplerad is reported to operate in that are NOT open yet (no accounts, no FX).
// They show as "Coming soon" until the partner confirms accounts and the database supports the currency.
export const COMING_SOON = [
  { flag: '🇬🇭', country: 'Ghana', cur: 'GHS', name: 'Ghanaian Cedi' },
  { flag: '🇰🇪', country: 'Kenya', cur: 'KES', name: 'Kenyan Shilling' },
  { flag: '🇨🇲', country: 'Cameroon', cur: 'XAF', name: 'Central African CFA Franc' },
];

// "Glade Bank" is stored in the database; the app only shows the brand "Glade".
export const brand = n => ((n || 'Glade').replace(/\s*bank$/i, '').trim() || 'Glade');

export const fmt = (n, c) => ((CUR[c] && CUR[c].sym) || '') + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const spaced = n => (n || '').replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');

// Signed-in user + their active accounts (one per currency, demo account preferred).
export async function loadAccounts() {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return { user: null, accounts: [] };
  const { data } = await supabase.from('accounts').select('id,currency,balance,account_number,bank_name,is_demo').eq('status', 'active');
  const m = {};
  (data || []).forEach(a => { if (!m[a.currency] || a.is_demo) m[a.currency] = a; });
  const accounts = Object.values(m).sort((a, b) => ORDER.indexOf(a.currency) - ORDER.indexOf(b.currency));
  return { user: s.session.user, accounts };
}

// Per-user settings (notifications, main currency, 2FA preference, login alerts).
export const DEFAULT_SETTINGS = {
  notify: { transactions: true, security: true, promotions: false, updates: true, email: true, push: true },
  base_currency: 'NGN', two_factor: false, two_factor_method: 'authenticator', login_alerts: true,
};
export async function loadSettings() {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return null;
  const { data } = await supabase.from('user_settings').select('*').eq('user_id', s.session.user.id).maybeSingle();
  return { ...DEFAULT_SETTINGS, ...(data || {}), notify: { ...DEFAULT_SETTINGS.notify, ...((data && data.notify) || {}) } };
}
export async function saveSettings(patch) {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return { error: { message: 'Please log in first.' } };
  return supabase.from('user_settings').upsert({ user_id: s.session.user.id, ...patch, updated_at: new Date().toISOString() });
}
