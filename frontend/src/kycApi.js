// Calls the kyc-submit Edge Function. Pass the app's existing Supabase client.
// form = { legal_name, date_of_birth: 'YYYY-MM-DD', bvn, phone_country_code: '+234', phone_number,
//          address: { street, city, state, postal_code }, photo_url? }
// Resolves to { status: 'verified', account: { account_number, bank_name, currency } | null }.
// Rejects with an Error whose .code is 'provider_not_configured' or 'function_unavailable' when the
// banking partner is not set up yet (callers may then fall back to the demo path).
const fail = (message, code) => Object.assign(new Error(message), { code });

export async function submitKyc(supabase, form) {
  const { data, error } = await supabase.functions.invoke('kyc-submit', { body: form });
  if (!error) return data;

  const status = error.context && error.context.status;
  if (status === 404 || error.name === 'FunctionsFetchError') {
    throw fail('Verification is not available yet.', 'function_unavailable');
  }
  let body = null;
  try { body = await error.context.json(); } catch { /* keep default */ }
  if (body && body.error === 'provider_not_configured') throw fail('Verification is not available yet.', 'provider_not_configured');
  if (body && body.error === 'already_pending') throw fail('Your verification is already in progress.', 'already_pending');
  throw fail((body && typeof body.error === 'string') ? body.error : 'Verification failed. Please try again.', 'failed');
}
