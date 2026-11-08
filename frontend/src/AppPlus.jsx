import React, { Suspense, lazy, useEffect, useState } from 'react';
import Base from './App.jsx';

// Every extra page is code-split: it downloads only when the user opens it, so the first screen loads fast.
const pick = (loader, name) => lazy(() => loader().then(m => ({ default: name ? m[name] : m.default })));
const Login = pick(() => import('./auth/AuthPages.jsx'), 'Login');
const Signup = pick(() => import('./auth/AuthPages.jsx'), 'Signup');
const LocalTransfer = pick(() => import('./transfer/LocalTransfer.jsx'));
const Wallets = pick(() => import('./transfer/Wallets.jsx'));
const Move = pick(() => import('./transfer/Move.jsx'));
const Exchange = pick(() => import('./transfer/Exchange.jsx'));
const Personal = pick(() => import('./settings/Pages.jsx'), 'Personal');
const Security = pick(() => import('./settings/Pages.jsx'), 'Security');
const TwoFA = pick(() => import('./settings/Pages.jsx'), 'TwoFA');
const Notify = pick(() => import('./settings/Pages.jsx'), 'Notify');
const Currency = pick(() => import('./settings/Pages.jsx'), 'Currency');
const Kyc = pick(() => import('./settings/Pages.jsx'), 'Kyc');
const Airtime = pick(() => import('./services/ServicesPages.jsx'), 'Airtime');
const Betting = pick(() => import('./services/ServicesPages.jsx'), 'Betting');
const TV = pick(() => import('./services/ServicesPages.jsx'), 'TV');
const Fixed = pick(() => import('./services/ServicesPages.jsx'), 'FixedPage');
const Invite = pick(() => import('./services/ServicesPages.jsx'), 'InvitePage');
const More = pick(() => import('./services/ServicesPages.jsx'), 'More');
const Cards = pick(() => import('./cards/CustomerCards.jsx'));

// OPay-style full-screen pages. They take precedence over the old mock pages.
const NEW = {
  login: Login, signup: Signup, local: LocalTransfer, accounts: Wallets, intl: Wallets, move: Move, exchange: Exchange,
  personal: Personal, security: Security, twofa: TwoFA, notify: Notify, currency: Currency, kyc: Kyc, verify: Kyc,
  airtime: Airtime, betting: Betting, tv: TV, fixed: Fixed, invite: Invite, more: More, services: More, hub: More,
};
// Remaining pages that still live in Extra.jsx (loaded on demand, inside the phone frame).
const OLD = ['bills', 'statements', 'limits', 'support', 'adjust', 'audit', 'forgot'];
function Old({ k }) {
  const [P, setP] = useState(null);
  useEffect(() => { import('./Extra.jsx').then(m => setP(() => m.PAGES[k] || null)); }, [k]);
  return P ? <P /> : null;
}

const get = () => (location.hash.startsWith('#/') ? location.hash.slice(2) : '');
// The old demo Currency Exchange screen lived inside the main app ('fx'); show the real one instead.
const route = r => (r === '' && sessionStorage.getItem('gb') === 'fx' ? 'exchange' : r);

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

const Fallback = () => <div className="boot"><i /></div>;

export default function AppPlus() {
  const [r, setR] = useState(get());
  useEffect(() => { const f = () => { setR(get()); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const k = route(r);
  if (NEW[k]) { const N = NEW[k]; return <Suspense fallback={<Fallback />}><N /></Suspense>; }
  if (k === 'cards') return <Suspense fallback={<Fallback />}><div className="phone" style={{ paddingBottom: 90 }}><div className="demo">DEMO MODE — simulated, no real money moves</div><Cards /></div></Suspense>;
  if (OLD.includes(k)) return <div className="phone" style={{ paddingBottom: 24 }}><div className="demo">DEMO MODE — simulated, no real money moves</div><Old k={k} /></div>;
  return <div style={{ display: 'contents' }} onClickCapture={intercept}><Base /></div>;
}
