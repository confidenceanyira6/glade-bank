import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import './transfer.css';

const BANKS = ['Access Bank', 'GTBank', 'Zenith Bank', 'First Bank', 'UBA', 'OPay', 'Kuda', 'Moniepoint', 'PalmPay', 'Wema Bank', 'Sterling Bank', 'Fidelity Bank', 'Union Bank', 'Stanbic IBTC'];
const NAMES = ['ADA OBI', 'TUNDE BAKARE', 'CHIOMA EZE', 'MUSA IBRAHIM', 'FATIMA YUSUF', 'EMEKA OKAFOR', 'BOLA ADEYEMI', 'NGOZI NWOSU'];
const QUICK = [1000, 2000, 5000, 10000, 20000, 50000];
const FEE = 10;
const money = n => '₦' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nameFor = acct => NAMES[[...acct].reduce((s, d) => s + Number(d), 0) % NAMES.length];

// OPay-style "Transfer to Bank Account" (demo: no real money moves).
export default function LocalTransfer() {
  const [step, setStep] = useState('form'); // form | confirm | pin | done
  const [acct, setAcct] = useState('');
  const [bank, setBank] = useState('');
  const [name, setName] = useState('');
  const [looking, setLooking] = useState(false);
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [sheet, setSheet] = useState(false);
  const [q, setQ] = useState('');
  const [bal, setBal] = useState(null);
  const [err, setErr] = useState('');
  const [ref] = useState(() => 'GB' + Math.random().toString(36).slice(2, 14).toUpperCase());

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) return;
      const { data } = await supabase.from('accounts').select('balance,is_demo').eq('currency', 'NGN').eq('status', 'active');
      if (data && data.length) setBal(Number((data.find(a => a.is_demo) || data[0]).balance));
    });
  }, []);

  useEffect(() => {
    setName('');
    if (acct.length !== 10 || !bank) return;
    setLooking(true);
    const t = setTimeout(() => { setName(nameFor(acct)); setLooking(false); }, 700);
    return () => { clearTimeout(t); setLooking(false); };
  }, [acct, bank]);

  const n = Number(amt);
  const total = n + FEE;
  const next = () => {
    setErr('');
    if (!name) return setErr('Enter a 10-digit account number and choose a bank.');
    if (!(n >= 100)) return setErr('Minimum transfer is ₦100.');
    if (bal !== null && total > bal) return setErr('Not enough balance for this transfer and fee.');
    setStep('confirm');
  };
  const press = d => {
    if (d === 'del') return setPin(pin.slice(0, -1));
    if (pin.length >= 4) return;
    const p = pin + d;
    setPin(p);
    if (p.length === 4) setTimeout(() => setStep('done'), 350);
  };
  const back = () => {
    if (step === 'pin') { setPin(''); return setStep('confirm'); }
    if (step === 'confirm') return setStep('form');
    location.hash = '#/hub';
  };

  const Head = ({ t }) => <div className="ot-head"><button onClick={back} aria-label="Back">←</button><h2>{t}</h2><span /></div>;

  if (step === 'done') {
    return (
      <div className="ot"><div className="ot-wrap ot-center">
        <div className="ot-check">✓</div>
        <h2>Transfer successful</h2>
        <div className="ot-big">{money(n)}</div>
        <p className="ot-mut">sent to {name}</p>
        <div className="ot-card">
          <div className="ot-kv"><span>Bank</span><b>{bank}</b></div>
          <div className="ot-kv"><span>Account number</span><b>{acct}</b></div>
          <div className="ot-kv"><span>Fee</span><b>{money(FEE)}</b></div>
          {note && <div className="ot-kv"><span>Remark</span><b>{note}</b></div>}
          <div className="ot-kv"><span>Reference</span><b>{ref}</b></div>
        </div>
        <p className="ot-demo">Demo only. No real money moved.</p>
        <a className="ot-btn" href="#/">Done</a>
        <button className="ot-btn ot-alt" onClick={() => { setStep('form'); setAmt(''); setNote(''); setPin(''); setAcct(''); setBank(''); }}>Make another transfer</button>
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
          <div className="ot-kv"><span>Fee</span><b>{money(FEE)}</b></div>
          <div className="ot-kv"><span>Amount to debit</span><b>{money(total)}</b></div>
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
        {looking && <div className="ot-name">Verifying account...</div>}
        {name && <div className="ot-name ok">✓ {name}</div>}
      </div>

      <div className="ot-card">
        <div className="ot-row"><label className="ot-lab">Amount</label><span className="ot-mut">Balance: {bal === null ? '--' : money(bal)}</span></div>
        <div className="ot-amt"><b>₦</b><input inputMode="decimal" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        <div className="ot-chips">{QUICK.map(v => <button key={v} onClick={() => setAmt(String(v))}>₦{v.toLocaleString()}</button>)}</div>
        <input className="ot-input" placeholder="Add a remark (optional)" maxLength={40} value={note} onChange={e => setNote(e.target.value)} />
        <p className="ot-mut" style={{ margin: '10px 0 0' }}>Transfer fee: {money(FEE)}</p>
      </div>

      {err && <p className="ot-err" role="alert">{err}</p>}
      <button className="ot-btn" onClick={next}>Next</button>
      <p className="ot-demo">Demo environment. No real money moves.</p>

      {sheet && (
        <div className="ot-sheet-bg" onClick={() => setSheet(false)}>
          <div className="ot-sheet" onClick={e => e.stopPropagation()}>
            <div className="ot-row"><h3>Select bank</h3><button className="ot-x" onClick={() => setSheet(false)}>✕</button></div>
            <input className="ot-input" placeholder="Search bank" value={q} onChange={e => setQ(e.target.value)} />
            <div className="ot-list">{list.map(b => <button key={b} onClick={() => { setBank(b); setSheet(false); setQ(''); }}><span className="ot-ic">{b[0]}</span>{b}</button>)}</div>
          </div>
        </div>
      )}
    </div></div>
  );
}
