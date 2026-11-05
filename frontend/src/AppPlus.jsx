import React, { useEffect, useState } from 'react';
import Base from './App.jsx';
import { PAGES, HUB } from './Extra.jsx';
import CustomerCards from './cards/CustomerCards.jsx';
import Accounts from './mybank/Accounts.jsx';
import { Login, Signup } from './auth/AuthPages.jsx';
import Move from './transfer/Move.jsx';

// '#/name' opens an extra page; otherwise the main app shows.
// cards / accounts / intl are the new pages and bring their own bottom nav.
const OWN_NAV = { cards: CustomerCards, accounts: Accounts, intl: Accounts };
// OPay-style auth pages (Supabase password login, no 2FA). They take precedence over the old mock Login in Extra.jsx.
const AUTH = { login: Login, signup: Signup };
// Own-account transfer page (#/move), listed first in the All Services hub.
PAGES.move = Move;
if (!HUB.some(h => h[0] === 'move')) HUB.unshift(['move', '🔁', 'Move Between My Accounts']);
const get = () => (location.hash.startsWith('#/') ? location.hash.slice(2) : '');

// The welcome screen's "Get Started" button used to open the old mock Register form; send it to the real sign-up page.
const toSignup = e => {
  if (e.target.closest && e.target.closest('.welcome .btn')) { e.stopPropagation(); location.hash = '#/signup'; }
};

export default function AppPlus() {
  const [r, setR] = useState(get());
  useEffect(() => { const f = () => { setR(get()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  if (AUTH[r]) { const A = AUTH[r]; return <A />; }
  const P = OWN_NAV[r] || PAGES[r];
  if (P) return <div className="phone" style={{ paddingBottom: OWN_NAV[r] ? 90 : 24 }}><div className="demo">DEMO MODE — simulated, no real money moves</div><P /></div>;
  return <div style={{ display: 'contents' }} onClickCapture={toSignup}><Base /></div>;
}
