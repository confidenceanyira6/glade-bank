import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import { CUR, ORDER, fmt, loadAccounts } from './common.js';
import './transfer.css';
import './wallets.css';

// Conversion fee tiers (by USD value). Mirrors the conversion_quote() database function, which does the real calculation.
const TIERS = [['$1 – $100', '$1'], ['$101 – $500', '$2'], ['$501 – $1,000', '$3'], ['$1,001 – $5,000', '$5'], ['Above $5,000', '$5 + 0.1% of the amount over $5,000']];

// Currency Exchange: convert between the user's own accounts with the tiered fee.
export default function Exchange() {
  const [user, setUser] = useState(undefined);
  const [accts, setAccts] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [quote, setQuote] = useState(null);
  const [x, setX] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const load = async () => {
    const r = await loadAccounts();
    setUser(r.user); setAccts(r.accounts);
    const cs = r.accounts.map(a => a.currency);
    setFrom(f => (cs.includes(f) ? f : cs.includes('USD') ? 'USD' : cs[0] || ''));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setTo(t => (t && t !== from ? t : ORDER.find(c => c !== from && c === 'NGN') || ORDER.find(c => c !== from) || '')); }, [from]);

  // 1 USD in the source currency, used to size the quick-amount buttons.
  useEffect(() => {
    if (!from) return;
    let live = true;
    supabase.rpc('own_transfer_rate', { p_from: 'USD', p_to: from }).then(({ data }) => { if (live) setX(data == null ? null : Number(data)); });
    return () => { live = false; };
  }, [from]);

  const n = Number(amt);
  useEffect(() => {
    if (!from || !to || from === to || !(n > 0)) { setQuote(null); return; }
    let live = true;
    const t = setTimeout(() => {
      supabase.rpc('conversion_quote', { p_from: from, p_to: to, p_amount: n }).then(({ data }) => { if (live) setQuote(data || null); });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [from, to, n]);

  const A = accts.find(a => a.currency === from);
  const submit = async () => {
    setErr('');
    if (!A) return setErr('Choose an account to convert from.');
    if (!(n > 0)) return setErr('Enter an amount to convert.');
    if (n > Number(A.balance)) return setErr(`Not enough funds. Available: ${fmt(A.balance, from)}.`);
    if (quote && n <= quote.fee) return setErr('Amount is too small to cover the conversion fee.');
    setBusy(true);
    const { data, error } = await supabase.rpc('transfer_between_own_accounts', { p_from: from, p_to: to, p_amount: n });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(data); load();
  };

  const Head = () => <div className="ot-head"><button onClick={() => { location.hash = '#/services'; }} aria-label="Back">←</button><h2>Currency Exchange</h2><span /></div>;

  if (user === undefined) return <div className="ot"><div className="ot-wrap"><Head /><p className="ot-mut">Loading...</p></div></div>;
  if (user === null) return <div className="ot"><div className="ot-wrap"><Head /><div className="ot-card"><p>Log in to convert currency.</p><a className="ot-btn" href="#/login">Log in</a></div></div></div>;
  if (!accts.length) return <div className="ot"><div className="ot-wrap"><Head /><div className="ot-card"><p>You have no accounts yet.</p><a className="ot-btn" href="#/accounts">Open an account</a></div></div></div>;

  if (done) {
    return (
      <div className="ot"><div className="ot-wrap ot-center">
        <div className="ot-check">✓</div>
        <h2>Exchange complete</h2>
        <div className="ot-big">{fmt(done.received, done.to_currency)}</div>
        <p className="ot-mut">{CUR[done.from_currency].flag} {done.from_currency} → {CUR[done.to_currency].flag} {done.to_currency}</p>
        <div className="ot-card">
          <div className="ot-kv"><span>Converted</span><b>{fmt(done.sent, done.from_currency)}</b></div>
          <div className="ot-kv"><span>Fee</span><b>{fmt(done.fee, done.from_currency)}</b></div>
          <div className="ot-kv"><span>Rate</span><b>1 {done.from_currency} = {done.rate} {done.to_currency}</b></div>
          <div className="ot-kv"><span>{done.from_currency} balance</span><b>{fmt(done.from_balance, done.from_currency)}</b></div>
          <div className="ot-kv"><span>{done.to_currency} balance</span><b>{fmt(done.to_balance, done.to_currency)}</b></div>
          <div className="ot-kv"><span>Reference</span><b>{done.reference}</b></div>
        </div>
        <button className="ot-btn" onClick={() => { setDone(null); setAmt(''); }}>Exchange more</button>
        <a className="ot-btn ot-alt" href="#/accounts">View my accounts</a>
      </div></div>
    );
  }

  const quick = x ? [100, 500, 1000].map(v => Math.round(v * x)) : [];
  return (
    <div className="ot"><div className="ot-wrap">
      <Head />
      <div className="ot-card">
        <label className="ot-lab">From</label>
        <select className="st-sel" value={from} onChange={e => { setFrom(e.target.value); setErr(''); }}>{accts.map(a => <option key={a.id} value={a.currency}>{CUR[a.currency].flag} {a.currency} · {fmt(a.balance, a.currency)}</option>)}</select>
        <label className="ot-lab">To</label>
        <select className="st-sel" value={to} onChange={e => { setTo(e.target.value); setErr(''); }}>{ORDER.filter(c => c !== from).map(c => <option key={c} value={c}>{CUR[c].flag} {c} · {CUR[c].name}</option>)}</select>
        <label className="ot-lab">Amount ({from})</label>
        <div className="ot-amt"><b>{CUR[from] ? CUR[from].sym : ''}</b><input inputMode="decimal" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        {quick.length > 0 && <div className="ot-chips">{quick.map(v => <button key={v} onClick={() => setAmt(String(v))}>{fmt(v, from).replace(/\.00$/, '')}</button>)}</div>}
      </div>

      <div className="ot-card">
        <small className="ot-mut">You get</small>
        <div className="ot-big" style={{ fontSize: 30 }}>{quote ? fmt(quote.receive, to) : '--'}</div>
        <div className="ot-kv"><span>Rate</span><b>{quote ? `1 ${from} = ${quote.rate} ${to}` : '--'}</b></div>
        <div className="ot-kv"><span>Fee</span><b>{quote ? `${fmt(quote.fee, from)} ($${Number(quote.fee_usd).toFixed(2)})` : '--'}</b></div>
      </div>

      {err && <p className="ot-err" role="alert">{err}</p>}
      <button className="ot-btn" disabled={busy} onClick={submit}>{busy ? 'Converting...' : 'Exchange now'}</button>

      <div className="ot-card" style={{ marginTop: 16 }}>
        <b>Conversion fees</b>
        {TIERS.map(([r, f]) => <div className="ot-kv" key={r}><span>{r}</span><b>{f}</b></div>)}
        <p className="ot-mut" style={{ margin: '6px 0 0', fontSize: 12 }}>Tiers are based on the dollar value of the amount you convert. Demo exchange rates.</p>
      </div>
    </div></div>
  );
}
