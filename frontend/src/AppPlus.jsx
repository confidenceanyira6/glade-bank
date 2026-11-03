import React, { useEffect, useState } from 'react';
import Base from './App.jsx';
import { PAGES } from './Extra.jsx';
import CustomerCards from './cards/CustomerCards.jsx';
import Accounts from './mybank/Accounts.jsx';

// '#/name' opens an extra page; otherwise the main app shows.
// cards / accounts / intl are the new pages and bring their own bottom nav.
const OWN_NAV = { cards: CustomerCards, accounts: Accounts, intl: Accounts };
const get = () => (location.hash.startsWith('#/') ? location.hash.slice(2) : '');
export default function AppPlus() {
  const [r, setR] = useState(get());
  useEffect(() => { const f = () => { setR(get()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const P = OWN_NAV[r] || PAGES[r];
  if (P) return <div className="phone" style={{ paddingBottom: OWN_NAV[r] ? 90 : 24 }}><div className="demo">DEMO MODE — simulated, no real money moves</div><P /></div>;
  return <Base />;
}
