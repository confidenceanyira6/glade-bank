// Calls the kyc-submit Edge Function. Pass the app's existing Supabase client.
// form = { legal_name, date_of_birth: 'YYYY-MM-DD', bvn, phone_country_code: '+234', phone_number,
//          address: { street, city, state, postal_code }, photo_url? }
// Resolves to { status: 'verified', account: { account_number, bank_name, currency } | null }.
export async function submitKyc(supabase, form) {
  const { data, error } = await supabase.functions.invoke('kyc-submit', { body: form });
  if (error) {
    let message = 'Verification failed. Please try again.';
    try {
      const body = await error.context.json();
      if (body?.error === 'provider_not_configured') message = 'Verification is not available yet.';
      else if (body?.error === 'already_pending') message = 'Your verification is already in progress.';
      else if (typeof body?.error === 'string') message = body.error;
    } catch { /* keep default */ }
    throw new Error(message);
  }
  return data;
}
