import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';

const CUR = { NGN: ['🇳🇬', 'Nigeria'], GBP: ['🇬🇧', 'United Kingdom'], USD: ['🇺🇸', 'United States'], EUR: ['🇪🇺', 'Eurozone'], CAD: ['🇨🇦', 'Canada'] };
const SYM = { NGN: '₦', GBP: '£', USD: '$', EUR: '€', CAD: 'C$' };
const label = c => `${CUR[c][0]} ${CUR[c][1]} (${c})`;
const fmt = (n, c) => (SYM[c] || '') + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Move money between the signed-in user's own accounts (e.g. Nigeria NGN -> UK GBP).
export default function Move() {
  const [user, setUser] = useState(undefined);
  const [bal, setBal] = useState({});
  const [from, setFrom] = useState('NGN');
  const [to, setTo] = useState('GBP');
  const [amt, setAmt] = useState('');
  const [rate, setRate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const load = async () => {
    const { data: s } = await supabase.auth.getSession();
    setUser(s.session ? s.session.user : null);
    if (!s.session) return;
    const { data } = await supabase.from('accounts').select('currency,balance,is_demo').eq('status', 'active');
    const m = {};
    (data || []).forEach(a => { if (m[a.currency] === undefined || a.is_demo) m[a.currency] = Number(a.balance); });
    setBal(m);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (from === to) { setRate(null); return; }
    let live = true;
    supabase.rpc('own_transfer_rate', { p_from: from, p_to: to }).then(({ data }) => { if (live) setRate(data == null ? null : Number(data)); });
    return () => { live = false; };
  }, [from, to]);

  const n = Number(amt);
  const recv = rate && n > 0 ? Math.round(n * rate * 100) / 100 : 0;
  const swap = () => { setFrom(to); setTo(from); setErr(''); };

  const submit = async () => {
    setErr('');
    if (from === to) return setErr('Choose two different accounts.');
    if (!(n > 0)) return setErr('Enter an amount to move.');
    if (n > (bal[from] || 0)) return setErr(`Not enough funds. Available: ${fmt(bal[from] || 0, from)}.`);
    setBusy(true);
    const { data, error } = await supabase.rpc('transfer_between_own_accounts', { p_from: from, p_to: to, p_amount: n });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(data);
    load();
  };

  const Back = () => <div className="top"><a className="back" href="#/hub" style={{ textDecoration: 'none' }}>←</a><h2>Move Money</h2><span /></div>;

  if (user === undefined) return <div className="pad"><Back /><p>Loading...</p></div>;
  if (user === null) return <div className="pad"><Back /><p>Log in to move money between your accounts.</p><a href="#/login"><button className="btn">Log in</button></a></div>;

  if (done) {
    return (
      <div className="pad"><Back />
        <div className="card">
          <span className="tag">Completed</span>
          <h3 style={{ margin: '10px 0 4px' }}>{fmt(done.sent, done.from_currency)} sent to your {done.to_currency} account</h3>
          <div className="kv"><span>You received</span><b>{fmt(done.received, done.to_currency)}</b></div>
          <div className="kv"><span>Rate</span><b>1 {done.from_currency} = {done.rate} {done.to_currency}</b></div>
          <div className="kv"><span>{done.from_currency} balance</span><b>{fmt(done.from_balance, done.from_currency)}</b></div>
          <div className="kv"><span>{done.to_currency} balance</span><b>{fmt(done.to_balance, done.to_currency)}</b></div>
          <div className="kv"><span>Reference</span><b>{done.reference}</b></div>
        </div>
        <button className="btn" onClick={() => { setDone(null); setAmt(''); }}>Move more money</button>
        <a href="#/"><button className="btn alt">Back home</button></a>
      </div>
    );
  }

  const ALL = Object.keys(CUR);
  const mine = Object.keys(bal);
  return (
    <div className="pad"><Back />
      <p style={{ color: 'var(--mut)', margin: '0 0 8px' }}>Move money between your own accounts. No fee.</p>
      <label className="field"><span>From account</span><div className="inp"><select value={from} onChange={e => setFrom(e.target.value)}>{(mine.length ? mine : ALL).map(c => <option key={c} value={c}>{label(c)}</option>)}</select></div></label>
      <p style={{ margin: '-4px 0 8px', fontSize: 13 }}>Available: <b>{fmt(bal[from] || 0, from)}</b></p>
      <div style={{ textAlign: 'center' }}><button className="tag" onClick={swap} type="button">⇅ Swap</button></div>
      <label className="field"><span>To account</span><div className="inp"><select value={to} onChange={e => setTo(e.target.value)}>{ALL.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></div></label>
      {to && bal[to] !== undefined && <p style={{ margin: '-4px 0 8px', fontSize: 13 }}>Balance: <b>{fmt(bal[to], to)}</b></p>}
      {to && bal[to] === undefined && <p style={{ margin: '-4px 0 8px', fontSize: 13 }}>You don't have a {to} account yet. One will be opened for you.</p>}
      <label className="field"><span>Amount ({from})</span><div className="inp"><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value)} /></div></label>
      <div className="card">
        <div className="kv"><span>Exchange rate</span><b>{rate ? `1 ${from} = ${rate} ${to}` : '--'}</b></div>
        <div className="kv"><span>Fee</span><b>Free</b></div>
        <div className="kv"><span>You receive</span><b>{recv ? fmt(recv, to) : '--'}</b></div>
      </div>
      {err && <p className="neg" role="alert">{err}</p>}
      <button className="btn" disabled={busy} onClick={submit}>{busy ? 'Moving...' : 'Move money'}</button>
    </div>
  );
}
