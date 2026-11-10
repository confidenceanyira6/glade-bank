// Single place that lists every country / currency the app offers.
// To add or remove a corridor, edit CURRENCIES only. Order = order shown in the dropdowns.
// [currency code, country name, flag]
export const CURRENCIES = [
  ['NGN', 'Nigeria', '🇳🇬'],
  ['USD', 'United States', '🇺🇸'],
  ['GBP', 'United Kingdom', '🇬🇧'],
  ['EUR', 'Germany', '🇪🇺'],
  ['CAD', 'Canada', '🇨🇦'],
  ['GHS', 'Ghana', '🇬🇭'],
  ['KES', 'Kenya', '🇰🇪'],
  ['ZAR', 'South Africa', '🇿🇦'],
  ['UGX', 'Uganda', '🇺🇬'],
  ['TZS', 'Tanzania', '🇹🇿'],
  ['XOF', 'Senegal', '🇸🇳'],
  ['EGP', 'Egypt', '🇪🇬'],
  ['AED', 'United Arab Emirates', '🇦🇪'],
  ['INR', 'India', '🇮🇳'],
  ['CNY', 'China', '🇨🇳'],
  ['AUD', 'Australia', '🇦🇺'],
];

// PLACEHOLDER demo rates, units per 1 USD. NOT real market rates.
// Replace rateFor() with your live conversion (e.g. read from the exchange_rates table or an FX API).
const DEMO_RATES = { USD: 1, NGN: 1540.25, EUR: 0.92, GBP: 0.79, CAD: 1.36, GHS: 15.5, KES: 129, ZAR: 18.2, UGX: 3700, TZS: 2600, XOF: 605, EGP: 49, AED: 3.67, INR: 84, CNY: 7.2, AUD: 1.52 };

// Units of `code` per 1 USD. Return null if no rate is available.
export const rateFor = (code) => (DEMO_RATES[code] != null ? DEMO_RATES[code] : null);

export const CODES = CURRENCIES.map((c) => c[0]);
export const COUNTRIES = CURRENCIES.map((c) => c[1]);

// Flag lookup by currency code OR by country name.
export const FLAG = {};
CURRENCIES.forEach(([code, country, flag]) => { FLAG[code] = flag; FLAG[country] = flag; });

// Default currency for a country.
export const currencyOfCountry = (country) => { const c = CURRENCIES.find((x) => x[1] === country); return c ? c[0] : null; };
