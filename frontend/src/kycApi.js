// Calls the KYC Edge Functions. Pass the app's existing Supabase client.
//
// submitKyc(supabase, form)      Level 2 (BVN): creates the banking-partner customer and issues the free account number.
//   form = { country: 'NG', legal_name, date_of_birth: 'YYYY-MM-DD', bvn (NG), id_number (other countries),
//            phone_country_code: '+234', phone_number, address: { street, city, state, postal_code }, photo_url? }
//   Resolves to { status: 'verified', account: { account_number, bank_name, currency } | null }.
//
// submitKycTier3(supabase, form)  Level 3 (NIN + ID).
//   form = { nin, id_type, id_number, id_image_url? }   Resolves to { status: 'verified', tier: 3 }.
//
// Rejects with an Error whose .code is 'provider_not_configured' or 'function_unavailable' when the
// banking partner is not set up yet.
const fail = (message, code) => Object.assign(new Error(message), { code });

async function call(supabase, fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (!error) return data;

  const status = error.context && error.context.status;
  if (status === 404 || error.name === 'FunctionsFetchError') {
    throw fail('Verification is not available yet.', 'function_unavailable');
  }
  let b = null;
  try { b = await error.context.json(); } catch { /* keep default */ }
  if (b && b.error === 'provider_not_configured') throw fail('Verification is not available yet.', 'provider_not_configured');
  if (b && b.error === 'already_pending') throw fail('Your verification is already in progress.', 'already_pending');
  throw fail((b && typeof b.error === 'string') ? b.error : 'Verification failed. Please try again.', 'failed');
}

export const submitKyc = (supabase, form) => call(supabase, 'kyc-submit', form);
export const submitKycTier3 = (supabase, form) => call(supabase, 'kyc-tier3', form);
