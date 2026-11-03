import React, { useState } from 'react';
import { Icon } from './icons.jsx';
import { ACCOUNT, INTL_ACCOUNTS, fmtMoney } from './accounts.js';
import './mybank.css';

const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const hash = (h) => () => { location.hash = h; };

/** Customer home in the MyBank layout. `go`, `tx` and `money` come from App.jsx. */
export default function MyBankHome({ go, tx = [], money = (n) => n }) {
  const [hide, setHide] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(ACCOUNT.number); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const tiles = [
    ['send', 'Send', hash('#/local')],
    ['globe', 'International', () => go('transfer')],
    ['deposit', 'Receive', () => go('receive')],
    ['wallet', 'Accounts', hash('#/accounts')],
    ['bill', 'Bills', hash('#/bills'), 1],
    ['card', 'Cards', hash('#/cards'), 1],
    ['bell', 'Alerts', () => go('notifs'), 1],
    ['support', 'Support', hash('#/support'), 1],
  ];

  return (
    <div className="mb">
      <div className="mb-hd">
        <div className="mb-av">CA</div>
        <div className="g"><small>{greet()}</small><b>Confidence</b></div>
        <button className="mb-ib" data-n="3" onClick={() => go('notifs')} aria-label="Notifications"><Icon n="bell" s={19} /></button>
        <button className="mb-ib" onClick={hash('#/support')} aria-label="Support"><Icon n="support" s={19} /></button>
      </div>

      <div className="mb-bal">
        <span className="lab">Total Balance
          <button onClick={() => setHide(!hide)} aria-label={hide ? 'Show balance' : 'Hide balance'}><Icon n={hide ? 'eyeoff' : 'eye'} s={16} /></button>
        </span>
        <b>{hide ? '•••••••' : '₦' + ACCOUNT.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>
        <span className="mb-chip">{ACCOUNT.currency} Account</span><span className="mb-chip">{ACCOUNT.type}</span>
        <div className="mb-acct">
          <div><small>Account number</small><b>{ACCOUNT.number}</b></div>
          <button className="mb-copy" onClick={copy}><Icon n={copied ? 'check' : 'copy'} s={14} />{copied ? 'Copied' : 'Copy'}</button>
        </div>
      </div>

      <div className="mb-tiles">
        {tiles.map(([ic, label, fn, n]) => (
          <button key={label} onClick={fn}><span className={'c' + (n ? ' n' : '')}><Icon n={ic} s={19} /></span>{label}</button>
        ))}
      </div>

      <div className="mb-intl">
        <div className="mb-sec" style={{ padding: 0 }}><b>International accounts</b><button className="mb-link" onClick={hash('#/accounts')}>View all</button></div>
        <div className="mb-pills">
          {INTL_ACCOUNTS.map((a) => <div className="mb-pill" key={a.cur}>{a.flag} {a.cur}<b>{hide ? '••••' : fmtMoney(a.balance, a.symbol)}</b></div>)}
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
