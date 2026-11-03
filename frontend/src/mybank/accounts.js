// Mock account data. DEMO ONLY: replace with API data once the backend exists.
// The routing / IBAN / sort-code values below are made-up placeholders, not real bank details.
export const ACCOUNT = { holder: 'Confidence Anyira', number: '0123456789', bank: 'Glade Bank', type: 'Savings', currency: 'NGN', balance: 850750.25, available: 720600.25 };

export const INTL_ACCOUNTS = [
  { cur: 'USD', name: 'US Dollar account', flag: '🇺🇸', number: '4821905512', balance: 1250.0, symbol: '$', details: [['Routing number (ABA)', '000123456'], ['Account type', 'Checking'], ['Bank', 'Glade Bank (demo partner)']] },
  { cur: 'GBP', name: 'British Pound account', flag: '🇬🇧', number: '31904477', balance: 640.5, symbol: '£', details: [['Sort code', '00-11-22'], ['IBAN', 'GB00 GLAD 0011 2231 9044 77'], ['Bank', 'Glade Bank (demo partner)']] },
  { cur: 'EUR', name: 'Euro account', flag: '🇪🇺', number: '0098123456', balance: 980.0, symbol: '€', details: [['IBAN', 'DE00 1234 5678 0098 1234 56'], ['SWIFT / BIC', 'GLADDEFFXXX'], ['Bank', 'Glade Bank (demo partner)']] },
  { cur: 'CAD', name: 'Canadian Dollar account', flag: '🇨🇦', number: '7765201', balance: 410.25, symbol: 'CA$', details: [['Institution number', '000'], ['Transit number', '12345'], ['Bank', 'Glade Bank (demo partner)']] },
];

export const INTL_ACTIVITY = [
  ['International Transfer', 'To USA · Sep 12, 2025', -500, 'USD'],
  ['Money Received', 'From UK · Sep 02, 2025', 200, 'GBP'],
  ['Currency exchange', 'NGN → EUR · Aug 28, 2025', 150, 'EUR'],
];

export const fmtMoney = (n, symbol) => symbol + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
