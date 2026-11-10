// Countries / currencies the app offers for sending money.
// Limited to what Maplerad's docs say it can pay out to (maplerad.dev/docs/transfers):
//   NGN bank transfer, USD (FEDWIRE / ACH), Francophone mobile money (XAF shown in their example).
// Accounts customers can OPEN are controlled separately by the database table public.country_account_catalog
// (currently NGN and USD, matching Maplerad's Collections docs).
// To add a corridor later, add a row here AFTER confirming Maplerad supports it for your account.
// [currency code, country name, flag]
export const CURRENCIES = [
  ['NGN', 'Nigeria', '🇳🇬'],
  ['USD', 'United States', '🇺🇸'],
  ['XAF', 'Cameroon', '🇨🇲'],
];

// PLACEHOLDER demo rates, units per 1 USD. NOT real market rates.
// Replace rateFor() with your live conversion (e.g. read from the exchange_rates table or Maplerad's FX API).
const DEMO_RATES = { USD: 1, NGN: 1540.25, XAF: 605 };

// Units of `code` per 1 USD. Return null if no rate is available.
export const rateFor = (code) => (DEMO_RATES[code] != null ? DEMO_RATES[code] : null);

export const CODES = CURRENCIES.map((c) => c[0]);
export const COUNTRIES = CURRENCIES.map((c) => c[1]);

// Flag lookup by currency code OR by country name.
export const FLAG = {};
CURRENCIES.forEach(([code, country, flag]) => { FLAG[code] = flag; FLAG[country] = flag; });

// Default currency for a country.
export const currencyOfCountry = (country) => { const c = CURRENCIES.find((x) => x[1] === country); return c ? c[0] : null; };
