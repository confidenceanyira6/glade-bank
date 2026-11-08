import React, { useEffect, useState } from 'react';
import { Icon } from './icons.jsx';
import { ACCOUNT, INTL_ACCOUNTS, fmtMoney } from './accounts.js';
import { CUR, loadAccounts, loadSettings } from '../transfer/common.js';
import './mybank.css';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const hash = (h) => () => { location.hash = h; };
const num = (n, c) => (CUR[c] ? CUR[c].sym : '') + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });

// Everyday services grid (Airtime, Betting, TV, Fixed, Invitation, More).
const SERVICES = [['📱', 'Airtime', '#/airtime'], ['⚽', 'Betting', '#/betting'], ['📺', 'TV', '#/tv'], ['🔒', 'Fixed', '#/fixed'], ['📣', 'Invitation', '#/invite'], ['🎓', 'More', '#/more']];

/** Customer home. Shows the signed-in user's real accounts (each with its own account number); falls back to demo data when logged out. */
export default function MyBankHome({ go, tx = [], money = (n) => n }) {
  const [hide, setHide] = useState(false);
  const [copied, setCopied] = useState(false);
  const [real, setReal] = useState(null);
  const [base, setBase] = useState('NGN');
  useEffect(() => {
    loadAccounts().then(r => { if (r.user && r.accounts.length) setReal(r); });
    loadSettings().then(s => { if (s) setBase(s.base_currency); });
  }, []);

  // The main account is the one in the user's chosen main currency (Profile > Currency Preferences).
  const main = real ? (real.accounts.find(a => a.currency === base) || real.accounts.find(a => a.currency === 'NGN') || real.accounts[0]) : null;
  const others = real ? real.accounts.filter(a => a !== main) : [];
  const number = main ? main.account_number : ACCOUNT.number;
  const full = real && real.user.user_metadata && real.user.user_metadata.full_name;
  const first = full ? full.split(' ')[0] : 'Confidence';
  const initials = full ? full.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : 'CA';
  const copy = () => { navigator.clipboard?.writeText(number); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const tiles = [
    ['send', 'Send', hash('#/local')],
    ['globe', 'International', () => go('transfer')],
    ['deposit', 'Receive', hash('#/accounts')],
    ['wallet', 'Move', hash('#/move')],
    ['bill', 'Bills', hash('#/bills'), 1],
    ['card', 'Cards', hash('#/cards'), 1],
    ['wallet', 'Accounts', hash('#/accounts'), 1],
    ['support', 'Support', hash('#/support'), 1],
  ];

  return (
    <div className="mb">
      <div className="mb-hd">
        <div className="mb-av">{initials}</div>
        <div className="g"><small>{greet()}</small><b>{first}</b></div>
        <button className="mb-ib" data-n="3" onClick={() => go('notifs')} aria-label="Notifications"><Icon n="bell" s={19} /></button>
        <button className="mb-ib" onClick={hash('#/support')} aria-label="Support"><Icon n="support" s={19} /></button>
      </div>

      <div className="mb-bal">
        <span className="lab">{main ? `${CUR[main.currency].country} balance` : 'Total Balance'}
          <button onClick={() => setHide(!hide)} aria-label={hide ? 'Show balance' : 'Hide balance'}><Icon n={hide ? 'eyeoff' : 'eye'} s={16} /></button>
        </span>
        <b>{hide ? '•••••••' : main ? num(main.balance, main.currency) : '₦' + ACCOUNT.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>
        <span className="mb-chip">{main ? main.currency : ACCOUNT.currency} Account</span><span className="mb-chip">{main ? main.bank_name : ACCOUNT.type}</span>
        <div className="mb-acct">
          <div><small>Account number</small><b>{number}</b></div>
          <button className="mb-copy" onClick={copy}><Icon n={copied ? 'check' : 'copy'} s={14} />{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>

      <div className="mb-tiles">
        {tiles.map(([ic, label, fn, n]) => (
          <button key={label} onClick={fn}><span className={'c' + (n ? ' n' : '')}><Icon n={ic} s={19} /></span>{label}</button>
        ))}
      </div>

      <div className="mb-tiles" style={{ marginTop: 12 }}>
        {SERVICES.map(([e, label, h]) => (
          <button key={label} onClick={hash(h)}><span className="c" style={{ fontSize: 20 }}>{e}</span>{label}</button>
        ))}
      </div>

      <div className="mb-intl">
        <div className="mb-sec" style={{ padding: 0 }}><b>{real ? 'My other accounts' : 'International accounts'}</b><button className="mb-link" onClick={hash('#/accounts')}>View all</button></div>
        <div className="mb-pills">
          {real
            ? others.map((a) => <div className="mb-pill" key={a.id}>{CUR[a.currency].flag} {a.currency}<b>{hide ? '••••' : num(a.balance, a.currency)}</b><small>{a.account_number}</small></div>)
            : INTL_ACCOUNTS.map((a) => <div className="mb-pill" key={a.cur}>{a.flag} {a.cur}<b>{hide ? '••••' : fmtMoney(a.balance, a.symbol)}</b></div>)}
          {real && others.length === 0 && <div className="mb-pill">No other accounts yet</div>}
        </div>
      </div>

      <div className="mb-sec"><b>Recent Transactions</b><button className="mb-link" onClick={() => go('history')}>See All</button></div>
      {tx.slice(0, 3).map((t) => (
        <div className="mb-tx" key={t[0]}>
          <span className="l">{t[0][0]}</span>
          <div className="g"><b>{t[0]}</b><small>{t[1]}</small></div>
          <span className={t[2] < 0 ? 'neg' : 'pos'}>{money(t[2], t[3])}</span>
        </div>
      ))}

      <div className="mb-grow"><div><b>Grow your wealth</b><br /><small>Glade Bank Investments</small></div><button onClick={() => go('invest')}>Invest</button></div>
    </div>
  );
}
