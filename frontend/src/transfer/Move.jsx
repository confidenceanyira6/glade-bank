import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import { CUR, fmt, spaced, loadAccounts } from './common.js';
import './transfer.css';
import './wallets.css';

// Move money between the signed-in user's own accounts (e.g. Nigeria NGN -> UK GBP).
export default function Move() {
  const [user, setUser] = useState(undefined);
  const [accts, setAccts] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState('');
  const [rate, setRate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);

  const load = async () => {
    const r = await loadAccounts();
    setUser(r.user); setAccts(r.accounts);
    const cs = r.accounts.map(a => a.currency);
    setFrom(f => (cs.includes(f) ? f : cs.includes('NGN') ? 'NGN' : cs[0] || ''));
    setTo(t => (cs.includes(t) ? t : cs.includes('GBP') ? 'GBP' : cs.find(c => c !== 'NGN') || ''));
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!from || !to || from === to) { setRate(null); return; }
    let live = true;
    supabase.rpc('own_transfer_rate', { p_from: from, p_to: to }).then(({ data }) => { if (live) setRate(data == null ? null : Number(data)); });
    return () => { live = false; };
  }, [from, to]);

  const get = c => accts.find(a => a.currency === c);
  const A = get(from), B = get(to);
  const n = Number(amt);
  const recv = rate && n > 0 ? Math.round(n * rate * 100) / 100 : 0;
  const pickFrom = c => { setFrom(c); if (c === to) setTo(accts.find(a => a.currency !== c)?.currency || ''); setErr(''); };
  const pickTo = c => { setTo(c); if (c === from) setFrom(accts.find(a => a.currency !== c)?.currency || ''); setErr(''); };

  const submit = async () => {
    setErr('');
    if (!A || !B || from === to) return setErr('Choose two different accounts.');
    if (!(n > 0)) return setErr('Enter an amount to move.');
    if (n > Number(A.balance)) return setErr(`Not enough funds. Available: ${fmt(A.balance, from)}.`);
    setBusy(true);
    const snap = { fromNo: A.account_number, toNo: B.account_number };
    const { data, error } = await supabase.rpc('transfer_between_own_accounts', { p_from: from, p_to: to, p_amount: n });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone({ ...data, ...snap });
    load();
  };

  const Head = () => <div className="ot-head"><button onClick={() => { location.hash = '#/accounts'; }} aria-label="Back">←</button><h2>Move Money</h2><span /></div>;
  const Card = ({ a, sel, onPick }) => (
    <button type="button" className={'wl-acct' + (sel ? ' sel' : '')} onClick={() => onPick(a.currency)}>
      <div className="wl-top">
        <span className="wl-flag">{CUR[a.currency].flag}</span>
        <div><b>{CUR[a.currency].country} account</b><small>{a.bank_name} · {spaced(a.account_number)}</small></div>
        <div className="wl-bal">{fmt(a.balance, a.currency)}</div>
      </div>
    </button>
  );

  if (user === undefined) return <div className="ot"><div className="ot-wrap"><Head /><p className="ot-mut">Loading...</p></div></div>;
  if (user === null) return <div className="ot"><div className="ot-wrap"><Head /><div className="ot-card"><p>Log in to move money between your accounts.</p><a className="ot-btn" href="#/login">Log in</a></div></div></div>;
  if (accts.length < 2) return <div className="ot"><div className="ot-wrap"><Head /><div className="ot-card"><p>You need at least two accounts to move money between them.</p><a className="ot-btn" href="#/accounts">Open another account</a></div></div></div>;

  if (done) {
    return (
      <div className="ot"><div className="ot-wrap ot-center">
        <div className="ot-check">✓</div>
        <h2>Money moved</h2>
        <div className="ot-big">{fmt(done.received, done.to_currency)}</div>
        <p className="ot-mut">{CUR[done.from_currency].flag} {done.from_currency} → {CUR[done.to_currency].flag} {done.to_currency}</p>
        <div className="ot-card">
          <div className="ot-kv"><span>You sent</span><b>{fmt(done.sent, done.from_currency)}</b></div>
          <div className="ot-kv"><span>From account</span><b>{done.fromNo}</b></div>
          <div className="ot-kv"><span>To account</span><b>{done.toNo}</b></div>
          <div className="ot-kv"><span>Rate</span><b>1 {done.from_currency} = {done.rate} {done.to_currency}</b></div>
          <div className="ot-kv"><span>{done.from_currency} balance</span><b>{fmt(done.from_balance, done.from_currency)}</b></div>
          <div className="ot-kv"><span>{done.to_currency} balance</span><b>{fmt(done.to_balance, done.to_currency)}</b></div>
          <div className="ot-kv"><span>Reference</span><b>{done.reference}</b></div>
        </div>
        <button className="ot-btn" onClick={() => { setDone(null); setAmt(''); }}>Move more money</button>
        <a className="ot-btn ot-alt" href="#/accounts">View my accounts</a>
      </div></div>
    );
  }

  return (
    <div className="ot"><div className="ot-wrap">
      <Head />
      <p className="ot-mut" style={{ margin: '0 2px 12px' }}>Move money between your own accounts. No fee.</p>
      <div className="wl-h" style={{ marginTop: 0 }}>From</div>
      {accts.map(a => <Card key={a.id} a={a} sel={a.currency === from} onPick={pickFrom} />)}
      <div className="wl-h">To</div>
      {accts.filter(a => a.currency !== from).map(a => <Card key={a.id} a={a} sel={a.currency === to} onPick={pickTo} />)}

      <div className="ot-card">
        <label className="ot-lab">Amount ({from})</label>
        <div className="ot-amt"><b>{CUR[from] ? CUR[from].sym : ''}</b><input inputMode="decimal" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        <div className="ot-kv"><span>Exchange rate</span><b>{rate ? `1 ${from} = ${rate} ${to}` : '--'}</b></div>
        <div className="ot-kv"><span>Fee</span><b>Free</b></div>
        <div className="ot-kv"><span>{CUR[to] ? CUR[to].country : ''} account receives</span><b>{recv ? fmt(recv, to) : '--'}</b></div>
      </div>
      {err && <p className="ot-err" role="alert">{err}</p>}
      <button className="ot-btn" disabled={busy} onClick={submit}>{busy ? 'Moving...' : 'Move money'}</button>
    </div></div>
  );
}
