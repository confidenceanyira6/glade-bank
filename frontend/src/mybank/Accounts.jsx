import React, { useState } from 'react';
import MBNav, { goBase } from './MBNav.jsx';
import { Icon } from './icons.jsx';
import { ACCOUNT, INTL_ACCOUNTS, INTL_ACTIVITY, fmtMoney } from './accounts.js';
import './mybank.css';

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return <button className="tag" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? 'Copied' : 'Copy'}</button>;
}

/** #/accounts — the customer's account number plus every international account. */
export default function Accounts() {
  const [open, setOpen] = useState(null);
  return (
    <div className="mb">
      <div className="top"><button className="back" onClick={() => goBase('home')} aria-label="Back"><Icon n="back" s={20} /></button><h2>My Accounts</h2><span /></div>

      <div className="mb-bal" style={{ marginTop: 0 }}>
        <span className="lab">{ACCOUNT.bank} · {ACCOUNT.type} · {ACCOUNT.currency}</span>
        <b>₦{ACCOUNT.balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</b>
        <div className="mb-acct">
          <div><small>Account number</small><b>{ACCOUNT.number}</b></div>
          <button className="mb-copy" onClick={() => navigator.clipboard?.writeText(ACCOUNT.number)}><Icon n="copy" s={14} />Copy</button>
        </div>
        <div style={{ fontSize: 12, opacity: .8, marginTop: 10 }}>{ACCOUNT.holder}</div>
      </div>

      <div className="pad">
        <div className="mb-sec" style={{ padding: 0, marginBottom: 8 }}><b>International accounts ({INTL_ACCOUNTS.length})</b></div>
        {INTL_ACCOUNTS.map((a) => (
          <div className={'mb-ac' + (open === a.cur ? ' open' : '')} key={a.cur}>
            <button className="h" onClick={() => setOpen(open === a.cur ? null : a.cur)} aria-expanded={open === a.cur}>
              <span className="f">{a.flag}</span>
              <span className="g"><b>{a.cur} account</b><small>•••• {a.number.slice(-4)}</small></span>
              <b>{fmtMoney(a.balance, a.symbol)}</b>
              <span className="rot"><Icon n="chev" s={16} /></span>
            </button>
            {open === a.cur && (
              <div className="body">
                <div className="mb-row"><span>Account holder</span><b>{ACCOUNT.holder}</b></div>
                <div className="mb-row"><span>Account number</span><b>{a.number} <CopyBtn value={a.number} /></b></div>
                {a.details.map(([l, v]) => <div className="mb-row" key={l}><span>{l}</span><b>{v}</b></div>)}
                <div className="mb-row"><span>Status</span><b><span className="tag">Active</span></b></div>
                <button className="btn" onClick={() => goBase('transfer')}>Send international transfer</button>
              </div>
            )}
          </div>
        ))}
        <span className="tag w">DEMO details — not real bank accounts</span>

        <div className="mb-sec" style={{ padding: 0, margin: '16px 0 4px' }}><b>International activity</b></div>
        {INTL_ACTIVITY.map((t) => (
          <div className="row" key={t[0]}><div className="av">{t[3] === 'USD' ? '🇺🇸' : t[3] === 'GBP' ? '🇬🇧' : '🇪🇺'}</div><span className="g">{t[0]}<small>{t[1]}</small></span><span className={t[2] < 0 ? 'neg' : 'pos'}>{t[2] < 0 ? '-' : '+'}{fmtMoney(Math.abs(t[2]), t[3] === 'USD' ? '$' : t[3] === 'GBP' ? '£' : '€')}</span></div>
        ))}
      </div>
      <MBNav active="home" />
    </div>
  );
}
