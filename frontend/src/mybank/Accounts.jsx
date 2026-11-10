import React, { useEffect, useState } from 'react';
import MBNav, { goBase } from './MBNav.jsx';
import { Icon } from './icons.jsx';
import { supabase } from '../auth/supabase.js';
import { listAddable, activateAccount } from '../accountsApi.js';
import './mybank.css';

const SYM = { NGN: '₦', USD: '$', GBP: '£', EUR: '€' };
const FLAG = { NGN: '🇳🇬', USD: '🇺🇸', GBP: '🇬🇧', EUR: '🇪🇺' };
const money = (n, cur) => (SYM[cur] || cur + ' ') + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CopyBtn({ value }) {
  const [ok, setOk] = useState(false);
  return <button className="tag" onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? 'Copied' : 'Copy'}</button>;
}

/** Sheet: pick a country, see the $ fee, pay it from the Naira balance and get that country's account number. */
function AddAccount({ onClose, onDone }) {
  const [data, setData] = useState(undefined);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => { listAddable(supabase).then(setData).catch((e) => { setErr(e.message); setData(null); }); }, []);
  const sel = data && data.addable.find((a) => a.code === pick);

  const go = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await activateAccount(supabase, sel.code, sel.fee_ngn || undefined);
      setDone(r); onDone();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="pad" style={{ border: '1px solid #e5e7eb', borderRadius: 14, marginBottom: 14 }}>
      <div className="mb-sec" style={{ padding: 0, marginBottom: 6 }}><b>Add a country account</b><button className="tag" onClick={onClose}>Close</button></div>
      {done ? <>
        <p><b>{done.account.currency} account is active.</b> You can now receive money from that country.</p>
        <div className="mb-row"><span>Account number</span><b>{done.account.account_number} <CopyBtn value={done.account.account_number} /></b></div>
        {done.account.bank_name && <div className="mb-row"><span>Bank</span><b>{done.account.bank_name}</b></div>}
        <div className="mb-row"><span>Fee charged</span><b>{money(done.charged_ngn, 'NGN')}</b></div>
        <button className="btn" onClick={onClose}>Done</button>
      </> : data === undefined ? <p>Loading...</p> : <>
        <p style={{ fontSize: 13, opacity: .8, marginTop: 0 }}>Receive money from another country with a local account number. Each extra country account costs a one-time $1.50, taken from your Naira balance.</p>
        {data && !data.verified && <p className="ot-err">Verify your identity first to add accounts.</p>}
        {data && data.verified && data.addable.length === 0 && <p>You already have every account we offer right now.</p>}
        {data && data.addable.map((a) => (
          <button key={a.code} type="button" className={'mb-ac' + (pick === a.code ? ' open' : '')} style={{ width: '100%', textAlign: 'left' }} onClick={() => setPick(a.code)}>
            <span className="h"><span className="f">{a.flag || FLAG[a.currency]}</span><span className="g"><b>{a.country_name} · {a.currency}</b><small>One-time activation fee</small></span><b>${a.fee_usd.toFixed(2)}{a.fee_ngn ? ' ≈ ' + money(a.fee_ngn, 'NGN') : ''}</b></span>
          </button>
        ))}
        {err && <p className="ot-err" role="alert">{err}</p>}
        {sel && <button className="btn" disabled={busy} onClick={go}>{busy ? 'Activating...' : `Pay $${sel.fee_usd.toFixed(2)} and activate`}</button>}
      </>}
    </div>
  );
}

/** #/accounts — the customer's real accounts, plus Add account. */
export default function Accounts() {
  const [st, setSt] = useState({ loading: true });
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const { data: s } = await supabase.auth.getSession();
    const user = s.session && s.session.user;
    if (!user) return setSt({ loading: false, user: null });
    const [a, v, p, k] = await Promise.all([
      supabase.from('accounts').select('id,currency,balance,account_number,bank_name,status,is_demo'),
      supabase.from('virtual_accounts').select('currency,account_name,routing_code,bank_name'),
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase.from('customer_verifications').select('status,country_of_residence').eq('user_id', user.id).maybeSingle(),
    ]);
    const accounts = (a.data || []).slice().sort((x, y) => (x.currency === 'NGN' ? -1 : y.currency === 'NGN' ? 1 : x.currency.localeCompare(y.currency)));
    const vas = {}; (v.data || []).forEach((r) => { vas[r.currency] = r; });
    setSt({ loading: false, user, accounts, vas, name: (p.data && p.data.full_name) || '', verified: k.data && k.data.status === 'verified' });
  };
  useEffect(() => { load(); }, []);

  const { loading, user, accounts = [], vas = {}, name, verified } = st;
  return (
    <div className="mb">
      <div className="top"><button className="back" onClick={() => goBase('home')} aria-label="Back"><Icon n="back" s={20} /></button><h2>My Accounts</h2><span /></div>
      <div className="pad">
        {loading && <p>Loading...</p>}
        {!loading && !user && <p>Log in to see your accounts. <a href="#/login">Log in</a></p>}
        {!loading && user && !verified && (
          <div className="mb-ac open"><div className="body">
            <b>Verify to get your free account number</b>
            <p style={{ fontSize: 13, opacity: .8 }}>After verification you get a free account number: a Nigerian Naira account if you live in Nigeria, or an account for your own country if we support it.</p>
            <button className="btn" onClick={() => { location.hash = '#/kyc'; }}>Verify my identity</button>
          </div></div>
        )}
        {!loading && user && accounts.map((a) => {
          const va = vas[a.currency] || {};
          return (
            <div className={'mb-ac' + (open === a.id ? ' open' : '')} key={a.id}>
              <button className="h" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                <span className="f">{FLAG[a.currency] || ''}</span>
                <span className="g"><b>{a.currency} account{a.is_demo ? ' (test)' : ''}</b><small>•••• {String(a.account_number).slice(-4)}</small></span>
                <b>{money(a.balance, a.currency)}</b>
                <span className="rot"><Icon n="chev" s={16} /></span>
              </button>
              {open === a.id && (
                <div className="body">
                  <div className="mb-row"><span>Account holder</span><b>{va.account_name || name}</b></div>
                  <div className="mb-row"><span>Account number</span><b>{a.account_number} <CopyBtn value={a.account_number} /></b></div>
                  <div className="mb-row"><span>Bank</span><b>{a.bank_name || va.bank_name || 'Glade Bank'}</b></div>
                  {va.routing_code && <div className="mb-row"><span>Routing code</span><b>{va.routing_code}</b></div>}
                  <div className="mb-row"><span>Status</span><b><span className="tag">{a.status === 'active' ? 'Active' : a.status}</span></b></div>
                </div>
              )}
            </div>
          );
        })}
        {!loading && user && verified && accounts.length === 0 && <p>Your account is being set up. Please check back shortly.</p>}
        {!loading && user && verified && !adding && (
          <button className="btn" style={{ marginTop: 12 }} onClick={() => setAdding(true)}>+ Add account</button>
        )}
        {adding && <AddAccount onClose={() => setAdding(false)} onDone={load} />}
        {!loading && user && <p style={{ fontSize: 12, opacity: .7, marginTop: 14 }}>Your first account number is free after verification. Extra country accounts are a one-time $1.50 each.</p>}
      </div>
      <MBNav active="home" />
    </div>
  );
}
