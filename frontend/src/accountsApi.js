// Calls the account-add Edge Function. Pass the app's existing Supabase client.
//   listAddable(supabase)  -> { verified, rate_available, addable: [{ code, country, country_name, currency, flag, fee_usd, fee_ngn }] }
//   activateAccount(supabase, code, maxNgn) -> { status: 'active', account: { account_number, bank_name, currency }, charged_ngn }
// Rejects with an Error whose .code is a short reason (insufficient_funds, rate_unavailable, price_changed, ...).
const fail = (message, code, extra) => Object.assign(new Error(message), { code }, extra || {});

async function call(supabase, body) {
  const { data, error } = await supabase.functions.invoke('account-add', { body });
  if (!error) return data;
  const status = error.context && error.context.status;
  if (status === 404 || error.name === 'FunctionsFetchError') {
    throw fail('This feature is not available yet.', 'function_unavailable');
  }
  let b = null;
  try { b = await error.context.json(); } catch { /* keep default */ }
  throw fail((b && b.message) || 'Request failed. Please try again.', (b && b.error) || 'failed', b && b.fee_ngn ? { fee_ngn: b.fee_ngn } : null);
}

export const listAddable = (supabase) => call(supabase, { action: 'list' });
export const activateAccount = (supabase, code, maxNgn) => call(supabase, { action: 'activate', code, max_ngn: maxNgn });
