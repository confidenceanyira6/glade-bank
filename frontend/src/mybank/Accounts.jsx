import React, { useEffect, useState } from 'react';
import MBNav, { goBase } from './MBNav.jsx';
import { Icon } from './icons.jsx';
import { CUR, loadAccounts } from '../transfer/common.js';
import './mybank.css';

const num = (n, c) => (CUR[c] ? CUR[c].sym : '') + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2 });

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return <button className="tag" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? 'Copied' : 'Copy'}</button>;
}

/** #/accounts — only the signed-in customer's real accounts. No sample data. */
export default function Accounts() {
  const [open, setOpen] = useState(null);
  const [state, setState] = useState({ loading: true, user: null, accounts: [] });
  useEffect(() => {
    loadAccounts().then((r) => setState({ loading: false, user: r && r.user, accounts: (r && r.accounts) || [] }))
      .catch(() => setState({ loading: false, user: null, accounts: [] }));
  }, []);

  const holder = state.user && state.user.user_metadata && state.user.user_metadata.full_name;

  return (
    <div className="mb">
      <div className="top"><button className="back" onClick={() => goBase('home')} aria-label="Back"><Icon n="back" s={20} /></button><h2>My Accounts</h2><span /></div>

      <div className="pad">
        {state.loading && <div className="mb-sec" style={{ padding: 0 }}><b>Loading your accounts…</b></div>}
        {!state.loading && !state.user && <div className="mb-sec" style={{ padding: 0 }}><b>Please sign in to see your accounts.</b></div>}
        {!state.loading && state.user && state.accounts.length === 0 && (
          <div className="mb-sec" style={{ padding: 0 }}><b>You don't have an account yet. Your account number will appear here once your identity is verified and our banking partner issues it.</b></div>
        )}

        {state.accounts.map((a) => (
          <div className={'mb-ac' + (open === a.id ? ' open' : '')} key={a.id}>
            <button className="h" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
              <span className="f">{CUR[a.currency] ? CUR[a.currency].flag : ''}</span>
              <span className="g"><b>{a.currency} account</b><small>{a.account_number ? '•••• ' + String(a.account_number).slice(-4) : 'Pending'}</small></span>
              <b>{num(a.balance, a.currency)}</b>
              <span className="rot"><Icon n="chev" s={16} /></span>
            </button>
            {open === a.id && (
              <div className="body">
                {holder && <div className="mb-row"><span>Account holder</span><b>{holder}</b></div>}
                {a.account_number && <div className="mb-row"><span>Account number</span><b>{a.account_number} <CopyBtn value={a.account_number} /></b></div>}
                {a.bank_name && <div className="mb-row"><span>Bank</span><b>{a.bank_name}</b></div>}
                <div className="mb-row"><span>Status</span><b><span className="tag">{a.status || 'Active'}</span></b></div>
                <button className="btn" onClick={() => goBase('transfer')}>Send international transfer</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <MBNav active="home" />
    </div>
  );
}
