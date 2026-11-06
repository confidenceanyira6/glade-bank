import React, { useEffect, useState } from 'react';
import Base from './App.jsx';
import { PAGES } from './Extra.jsx';
import CustomerCards from './cards/CustomerCards.jsx';
import { Login, Signup } from './auth/AuthPages.jsx';
import Move from './transfer/Move.jsx';
import Wallets from './transfer/Wallets.jsx';
import LocalTransfer from './transfer/LocalTransfer.jsx';
import { Personal, Security, TwoFA, Notify, Currency, Kyc, Services } from './settings/Pages.jsx';

// '#/name' opens an extra page; otherwise the main app shows.
const OWN_NAV = { cards: CustomerCards };
// OPay-style full-screen pages. They take precedence over the old mock pages.
const AUTH = {
  login: Login, signup: Signup, local: LocalTransfer, accounts: Wallets, intl: Wallets, move: Move,
  personal: Personal, security: Security, twofa: TwoFA, notify: Notify, currency: Currency, kyc: Kyc, verify: Kyc, services: Services, hub: Services,
};
const get = () => (location.hash.startsWith('#/') ? location.hash.slice(2) : '');

// Profile menu rows -> their pages (the Base app's rows only had placeholders).
const MENU = {
  'Personal Information': 'personal', 'Security Settings': 'security', 'Two-Factor Authentication': 'twofa',
  'Notification Preferences': 'notify', 'Currency Preferences': 'currency', 'Verification Status': 'kyc', 'All Services': 'services',
};
// Capture clicks before the Base app sees them: welcome "Get Started" -> sign-up, Profile rows -> pages.
const intercept = e => {
  const t = e.target;
  if (!t || !t.closest) return;
  if (t.closest('.welcome .btn')) { e.stopPropagation(); location.hash = '#/signup'; return; }
  const row = t.closest('.menu');
  const label = row && row.querySelector('.g');
  const to = label && MENU[label.textContent.trim()];
  if (to) { e.stopPropagation(); location.hash = '#/' + to; }
};

export default function AppPlus() {
  const [r, setR] = useState(get());
  useEffect(() => { const f = () => { setR(get()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  if (AUTH[r]) { const A = AUTH[r]; return <A />; }
  const P = OWN_NAV[r] || PAGES[r];
  if (P) return <div className="phone" style={{ paddingBottom: OWN_NAV[r] ? 90 : 24 }}><div className="demo">DEMO MODE — simulated, no real money moves</div><P /></div>;
  return <div style={{ display: 'contents' }} onClickCapture={intercept}><Base /></div>;
}
