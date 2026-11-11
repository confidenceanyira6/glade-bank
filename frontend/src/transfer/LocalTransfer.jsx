import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import './transfer.css';

const BANKS = ['Glade Bank', 'Access Bank', 'GTBank', 'Zenith Bank', 'First Bank', 'UBA', 'OPay', 'Kuda', 'Moniepoint', 'PalmPay', 'Wema Bank', 'Sterling Bank', 'Fidelity Bank', 'Union Bank', 'Stanbic IBTC'];
// Bank codes used by the name-enquiry service (edge function resolve-account). Glade Bank is looked up in our own database.
const BANK_CODES = { 'Access Bank': '044', 'GTBank': '058', 'Zenith Bank': '057', 'First Bank': '011', 'UBA': '033', 'Wema Bank': '035', 'Sterling Bank': '232', 'Fidelity Bank': '070', 'Union Bank': '032', 'Stanbic IBTC': '221', 'Kuda': '50211', 'Moniepoint': '50515', 'OPay': '999992', 'PalmPay': '999991' };
const QUICK = [1000, 2000, 5000, 10000, 20000, 50000];
const money = n => '₦' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// OPay-style "Transfer to Bank Account".
// Name enquiry runs as soon as 10 digits are typed: Glade Bank accounts come from our database, accounts at other banks
// from the resolve-account edge function (needs PAYSTACK_SECRET_KEY). With no bank picked, it works out the bank too.
// The transaction PIN is asked AFTER the Confirm screen and checked on the server.
// Transfers to other banks are still simulated (no real bank connection yet).
export default function LocalTransfer() {
  const [step, setStep] = useState('form'); // form | confirm | pin | done
  const [acct, setAcct] = useState('');
  const [bank, setBank] = useState('');
  const [found, setFound] = useState(null); // { name, bank } once the account is verified
  const [choices, setChoices] = useState([]); // several banks matched this number: let the user pick
  const [lookMsg, setLookMsg] = useState('');
  const [verifier, setVerifier] = useState('unknown'); // unknown | on | off  (off = name service not set up / unreachable)
  const [manual, setManual] = useState('');
  const [looking, setLooking] = useState(false);
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState('');
  const [bal, setBal] = useState(null);
  const [err, setErr] = useState('');
  const [res, setRes] = useState(null);
  const lastKey = useRef('');

  const loadBal = async () => {
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return;
    const { data } = await supabase.from('accounts').select('balance,is_demo').eq('currency', 'NGN').eq('status', 'active');
    if (data && data.length) setBal(Number((data.find(a => a.is_demo) || data[0]).balance));
  };
  useEffect(() => { loadBal(); }, []);

  const pick = (name, bankName) => {
    lastKey.current = `${acct}|${bankName}`;
    setFound({ name, bank: bankName });
    setBank(bankName);
    setChoices([]);
    setLookMsg('');
  };

  // Name enquiry: runs as soon as 10 digits are typed (and again if the bank is changed).
  useEffect(() => {
    if (acct.length !== 10) { lastKey.current = ''; setFound(null); setChoices([]); setLookMsg(''); return; }
    const key = `${acct}|${bank}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    setFound(null); setChoices([]); setLookMsg('');
    let live = true;
    setLooking(true);
    (async () => {
      // 1) Glade Bank account?
      const { data } = await supabase.rpc('lookup_account', { p_account_number: acct });
      if (!live) return;
      if (data && data.found) { setLooking(false); return pick(data.name, data.bank); }
      // 2) Account at another bank
      const { data: r, error } = await supabase.functions.invoke('resolve-account', {
        body: { account_number: acct, bank_code: BANK_CODES[bank] || undefined },
      });
      if (!live) return;
      setLooking(false);
      if (error || !r || r.error === 'not_configured' || (!r.ok && r.error !== 'not_found')) { setVerifier('off'); return; }
      setVerifier('on');
      if (!r.ok) return setLookMsg(bank ? `We couldn't find this account at ${bank}. Check the number or pick another bank.` : "We couldn't find this account. Check the number or pick the bank.");
      if (r.matches.length === 1) return pick(r.matches[0].name, r.matches[0].bank_name);
      setChoices(r.matches);
    })();
    return () => { live = false; };
  }, [acct, bank]);

  const name = found ? found.name : manual.trim().toUpperCase();
  const hint = acct.length === 0 ? '' : acct.length < 10 ? `Account numbers have 10 digits (${acct.length} entered).` : '';
  const unverified = acct.length === 10 && !looking && !found && !choices.length && verifier === 'off' && bank;

  const n = Number(amt);
  const next = () => {
    setErr('');
    if (acct.length !== 10) return setErr('Enter a 10-digit account number.');
    if (choices.length) return setErr('Choose which bank this account is with.');
    if (!bank) return setErr('Select a bank.');
    if (!name) return setErr(unverified ? 'Enter the account name.' : looking ? 'Wait for the account name to load.' : 'We could not verify this account. Check the number and bank.');
    if (!(n >= 100)) return setErr('Minimum transfer is ₦100.');
    if (bal !== null && n > bal) return setErr('Not enough balance for this transfer.');
    setStep('confirm');
  };

  const submit = async p => {
    setBusy(true); setPinErr('');
    const { data, error } = await supabase.rpc('send_local_transfer', { p_bank: bank, p_account_number: acct, p_recipient_name: name, p_amount: n, p_note: note, p_pin: p });
    setBusy(false);
    if (error) { setPin(''); return setPinErr(error.message); }
    if (!data.ok) { setPin(''); return setPinErr(data.error); }
    setRes(data); setStep('done'); loadBal();
  };
  const press = d => {
    if (busy) return;
    if (d === 'del') return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const p = pin + d;
    setPin(p);
    if (p.length === 4) submit(p);
  };
  const back = () => {
    if (step === 'pin') { setPin(''); setPinErr(''); return setStep('confirm'); }
    if (step === 'confirm') return setStep('form');
    location.hash = '#/services';
  };

  const Head = ({ t }) => <div className="ot-head"><button onClick={back} aria-label="Back">←</button><h2>{t}</h2><span /></div>;

  if (step === 'done' && res) {
    return (
      <div className="ot"><div className="ot-wrap ot-center">
        <div className="ot-check">✓</div>
        <h2>Transfer successful</h2>
        <div className="ot-big">{money(res.amount)}</div>
        <p className="ot-mut">sent to {res.name}</p>
        <div className="ot-card">
          <div className="ot-kv"><span>Bank</span><b>{bank}</b></div>
          <div className="ot-kv"><span>Account number</span><b>{acct}</b></div>
          {note && <div className="ot-kv"><span>Remark</span><b>{note}</b></div>}
          <div className="ot-kv"><span>Reference</span><b>{res.reference}</b></div>
          <div className="ot-kv"><span>New balance</span><b>{money(res.balance)}</b></div>
        </div>
        {res.kind === 'external_demo' && <p className="ot-demo">Demo: transfers to other banks are simulated. The money left your account but nothing was sent to a real bank.</p>}
        <a className="ot-btn" href="#/">Done</a>
        <button className="ot-btn ot-alt" onClick={() => { setStep('form'); setAmt(''); setNote(''); setPin(''); setAcct(''); setBank(''); setManual(''); setRes(null); lastKey.current = ''; }}>Make another transfer</button>
      </div></div>
    );
  }

  if (step === 'pin') {
    return (
      <div className="ot"><div className="ot-wrap">
        <Head t="Enter payment PIN" />
        <div className="ot-center">
          <div className="ot-big">{money(n)}</div>
          <p className="ot-mut">to {name}</p>
          <div className="ot-dots">{[0, 1, 2, 3].map(i => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
          {busy && <p className="ot-mut">Sending...</p>}
          {pinErr && <p className="ot-err" role="alert">{pinErr}{/PIN in Security/.test(pinErr) && <> <a href="#/security" style={{ color: 'var(--g)', fontWeight: 700 }}>Set PIN</a></>}</p>}
        </div>
        <div className="ot-pad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => k === '' ? <span key={i} /> : <button key={i} onClick={() => press(k)}>{k === 'del' ? '⌫' : k}</button>)}
        </div>
      </div></div>
    );
  }

  if (step === 'confirm') {
    return (
      <div className="ot"><div className="ot-wrap">
        <Head t="Confirm transfer" />
        <div className="ot-center"><div className="ot-big">{money(n)}</div></div>
        <div className="ot-card">
          <div className="ot-kv"><span>Recipient</span><b>{name}</b></div>
          <div className="ot-kv"><span>Account number</span><b>{acct}</b></div>
          <div className="ot-kv"><span>Bank</span><b>{bank}</b></div>
          <div className="ot-kv"><span>Fee</span><b>Free</b></div>
          {note && <div className="ot-kv"><span>Remark</span><b>{note}</b></div>}
        </div>
        <button className="ot-btn" onClick={() => setStep('pin')}>Confirm</button>
      </div></div>
    );
  }

  const list = BANKS.filter(b => b.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="ot"><div className="ot-wrap">
      <Head t="Transfer to Bank Account" />
      <div className="ot-card">
        <label className="ot-lab">Recipient account</label>
        <input className="ot-input" inputMode="numeric" maxLength={10} placeholder="Enter 10-digit account number" value={acct} onChange={e => setAcct(e.target.value.replace(/\D/g, ''))} />
        <button className="ot-bank" onClick={() => setSheet(true)}><span>{bank || 'Select bank'}</span><i>›</i></button>
        {hint && <div className="ot-name">{hint}</div>}
        {looking && <div className="ot-name">Verifying account...</div>}
        {found && <div className="ot-name ok">✓ {found.name}</div>}
        {choices.length > 0 && <>
          <div className="ot-name">This number matches more than one bank. Tap the right one:</div>
          <div className="ot-chips" style={{ marginTop: 10 }}>
            {choices.map(c => <button key={c.bank_code} onClick={() => pick(c.name, c.bank_name)}>{c.bank_name} · {c.name}</button>)}
          </div>
        </>}
        {lookMsg && !found && !looking && <div className="ot-name">{lookMsg}</div>}
        {unverified && <>
          <div className="ot-name">We can't verify accounts at other banks yet. Enter the account name to continue.</div>
          <input className="ot-input" style={{ marginTop: 10 }} placeholder="Account name" value={manual} onChange={e => setManual(e.target.value)} />
        </>}
      </div>

      <div className="ot-card">
        <div className="ot-row"><label className="ot-lab">Amount</label><span className="ot-mut">Balance: {bal === null ? '--' : money(bal)}</span></div>
        <div className="ot-amt"><b>₦</b><input inputMode="decimal" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        <div className="ot-chips">{QUICK.map(v => <button key={v} onClick={() => setAmt(String(v))}>₦{v.toLocaleString()}</button>)}</div>
        <input className="ot-input" placeholder="Add a remark (optional)" maxLength={40} value={note} onChange={e => setNote(e.target.value)} />
      </div>

      {err && <p className="ot-err" role="alert">{err}</p>}
      <button className="ot-btn" onClick={next}>Next</button>

      {sheet && (
        <div className="ot-sheet-bg" onClick={() => setSheet(false)}>
          <div className="ot-sheet" onClick={e => e.stopPropagation()}>
            <div className="ot-row"><h3>Select bank</h3><button className="ot-x" onClick={() => setSheet(false)}>✕</button></div>
            <input className="ot-input" placeholder="Search bank" value={q} onChange={e => setQ(e.target.value)} />
            <div className="ot-list">{list.map(b => <button key={b} onClick={() => { setBank(b); setSheet(false); setQ(''); }}><span className="ot-ic">{b[0]}</span>{b}</button>)}
            </div>
          </div>
        </div>
      )}
    </div></div>
  );
}
