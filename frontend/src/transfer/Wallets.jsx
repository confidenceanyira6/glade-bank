import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import { CUR, ORDER, PARTNER, COMING_SOON, brand, fmt, spaced, loadAccounts } from './common.js';
import './transfer.css';
import './wallets.css';

const REGION = { africa: 'Africa', europe: 'Europe', americas: 'the Americas', asia: 'Asia', oceania: 'Oceania', default: 'your region' };
const when = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

// My Accounts: every currency account has its own account number and can receive money at any time.
// Brand shown to customers is "Glade". The licensed partner institution behind each account is disclosed
// ("Provided by ...") as soon as it is set in PARTNER (common.js).
export default function Wallets() {
  const [user, setUser] = useState(undefined);
  const [accts, setAccts] = useState([]);
  const [recv, setRecv] = useState(null);
  const [copied, setCopied] = useState('');
  const [sim, setSim] = useState('5000');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [fee, setFee] = useState(null);

  const load = async () => { const r = await loadAccounts(); setUser(r.user); setAccts(r.accounts); setRecv(cur => (cur ? r.accounts.find(a => a.id === cur.id) || null : null)); };
  useEffect(() => { load(); supabase.rpc('my_fee_info').then(({ data }) => setFee(data || null)); }, []);

  const copy = (n) => { navigator.clipboard && navigator.clipboard.writeText(n); setCopied(n); setTimeout(() => setCopied(''), 1500); };
  const open = async (c) => {
    setErr(''); setBusy(true);
    const { error } = await supabase.rpc('open_my_account', { p_currency: c });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg(`${CUR[c].country} ${c} account opened.`);
    load();
  };
  const simulate = async () => {
    setErr(''); setBusy(true);
    const { data, error } = await supabase.rpc('demo_receive_payment', { p_account_number: recv.account_number, p_amount: Number(sim), p_sender: 'John Smith' });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg(`Received ${fmt(data.amount, data.currency)} from John Smith. New balance ${fmt(data.balance, data.currency)}.`);
    load();
  };

  const Head = () => <div className="ot-head"><button onClick={() => { location.hash = '#/'; }} aria-label="Back">←</button><h2>My Accounts</h2><span /></div>;

  if (user === undefined) return <div className="ot"><div className="ot-wrap"><Head /><p className="ot-mut">Loading...</p></div></div>;
  if (user === null) return <div className="ot"><div className="ot-wrap"><Head /><div className="ot-card"><p>Log in to see your accounts and account numbers.</p><a className="ot-btn" href="#/login">Log in</a></div></div></div>;

  const missing = ORDER.filter(c => !accts.some(a => a.currency === c));
  const holder = (user.user_metadata && user.user_metadata.full_name) || user.email;
  const f = fee && fee.fee;
  const partnerNote = { margin: '8px 2px 0', fontSize: 12, color: 'var(--mut)' };

  return (
    <div className="ot"><div className="ot-wrap">
      <Head />
      <p className="ot-mut" style={{ margin: '0 2px 12px' }}>Each account has its own account number. Money sent to any of them lands in that account, anytime.</p>
      {msg && <div className="wl-toast">{msg}</div>}
      {err && <p className="ot-err" role="alert">{err}</p>}

      {accts.map(a => (
        <div className="wl-acct" key={a.id}>
          <div className="wl-top">
            <span className="wl-flag">{CUR[a.currency].flag}</span>
            <div><b>{CUR[a.currency].country} account</b><small>{CUR[a.currency].name} ({a.currency})</small></div>
            <div className="wl-bal">{fmt(a.balance, a.currency)}</div>
          </div>
          <div className="wl-num">
            <div><small>{brand(a.bank_name)} account number</small><b>{spaced(a.account_number)}</b></div>
            <button className="wl-copy" onClick={() => copy(a.account_number)}>{copied === a.account_number ? 'Copied' : 'Copy'}</button>
          </div>
          {PARTNER[a.currency] && <p style={partnerNote}>Account provided by {PARTNER[a.currency]}</p>}
          <div className="wl-acts">
            <button className="fill" onClick={() => { setRecv(a); setMsg(''); setErr(''); }}>Receive</button>
            <a href="#/move">Move money</a>
          </div>
        </div>
      ))}

      {accts.length === 0 && <div className="ot-card"><p className="ot-mut">No accounts yet. Open one below.</p></div>}

      {f && f.amount != null && (
        <div className="ot-card">
          <div className="ot-row"><b>Monthly account fee</b><b>{fmt(f.amount, f.currency)}</b></div>
          <p className="ot-mut" style={{ margin: '6px 0 0', fontSize: 13 }}>
            Charged on the 1st of each month to your main account ({f.currency}). Based on {REGION[f.region] || 'your region'}: {Number(f.base_amount)} {f.base_currency}, converted to your account currency. Next charge: {when(fee.next_charge)}.
            {fee.last_period && <> Last charged: {fee.last_period} ({fmt(fee.last_amount, fee.last_currency)}).</>}
          </p>
        </div>
      )}

      {missing.length > 0 && (
        <>
          <div className="wl-h">Open another account</div>
          <div className="ot-chips">{missing.map(c => <button key={c} disabled={busy} onClick={() => open(c)}>{CUR[c].flag} {CUR[c].country} ({c})</button>)}</div>
        </>
      )}

      <div className="wl-h">Coming soon</div>
      <div className="ot-card">
        {COMING_SOON.map(c => (
          <div className="ot-kv" key={c.cur}><span>{c.flag} {c.country}</span><b>{c.cur} · soon</b></div>
        ))}
        <p className="ot-mut" style={{ margin: '8px 0 0', fontSize: 13 }}>We're adding more countries with licensed local partners. We'll tell you when accounts open.</p>
      </div>

      {accts.length > 1 && <a className="ot-btn" href="#/move">Move money between my accounts</a>}

      {recv && (
        <div className="ot-sheet-bg" onClick={() => setRecv(null)}>
          <div className="ot-sheet" onClick={e => e.stopPropagation()}>
            <div className="ot-row"><h3>Receive {recv.currency}</h3><button className="ot-x" onClick={() => setRecv(null)}>✕</button></div>
            <div className="ot-card" style={{ background: '#f7f3e6' }}>
              <div className="ot-kv"><span>Account name</span><b>{holder}</b></div>
              <div className="ot-kv"><span>{PARTNER[recv.currency] ? 'Bank' : 'Provider'}</span><b>{PARTNER[recv.currency] || brand(recv.bank_name)}</b></div>
              <div className="ot-kv"><span>Account number</span><b>{recv.account_number}</b></div>
              <div className="ot-kv"><span>Currency</span><b>{CUR[recv.currency].flag} {recv.currency}</b></div>
              <div className="ot-kv"><span>Balance</span><b>{fmt(recv.balance, recv.currency)}</b></div>
            </div>
            {PARTNER[recv.currency] && <p style={partnerNote}>{brand(recv.bank_name)} accounts are provided by {PARTNER[recv.currency]}. Tell senders to choose {PARTNER[recv.currency]} as the bank.</p>}
            <button className="ot-btn" onClick={() => copy(recv.account_number)}>{copied === recv.account_number ? 'Copied' : 'Copy account number'}</button>
            <div className="wl-sim">
              <p>Demo: simulate someone sending money to this account number.</p>
              <input className="ot-input" inputMode="decimal" value={sim} onChange={e => setSim(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Amount" />
              <button className="ot-btn ot-alt" disabled={busy} onClick={simulate}>{busy ? 'Sending...' : `Simulate incoming ${recv.currency}`}</button>
            </div>
            {msg && <div className="wl-toast" style={{ marginTop: 12 }}>{msg}</div>}
            {err && <p className="ot-err">{err}</p>}
          </div>
        </div>
      )}
    </div></div>
  );
}
