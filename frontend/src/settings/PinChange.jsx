import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';

const only = (n, set) => e => set(e.target.value.replace(/\D/g, '').slice(0, n));
const mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Transaction PIN: set it once, then change it only with the old PIN + a code sent to the user's phone.
export default function PinChange({ hasPin, onChanged }) {
  const [mode, setMode] = useState('idle'); // idle | old | otp
  const [old, setOld] = useState('');
  const [otp, setOtp] = useState('');
  const [n1, setN1] = useState('');
  const [n2, setN2] = useState('');
  const [info, setInfo] = useState(null);
  const [left, setLeft] = useState(0);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (mode !== 'otp') return;
    const t = setInterval(() => { setLeft(x => Math.max(0, x - 1)); setWait(x => Math.max(0, x - 1)); }, 1000);
    return () => clearInterval(t);
  }, [mode]);

  const reset = () => { setMode('idle'); setOld(''); setOtp(''); setN1(''); setN2(''); setInfo(null); setErr(''); };

  const setFirst = async () => {
    setErr(''); setMsg('');
    if (!/^\d{4}$/.test(n1)) return setErr('PIN must be exactly 4 digits.');
    if (n1 !== n2) return setErr('PINs do not match.');
    setBusy(true);
    const { error } = await supabase.rpc('set_my_pin', { p_pin: n1 });
    setBusy(false);
    if (error) return setErr(error.message);
    setN1(''); setN2(''); setMsg('Transaction PIN set.'); onChanged && onChanged();
  };

  const sendCode = async () => {
    setErr(''); setMsg('');
    if (!/^\d{4}$/.test(old)) return setErr('Enter your current 4-digit PIN.');
    setBusy(true);
    const { data, error } = await supabase.rpc('request_pin_change_otp', { p_old_pin: old });
    setBusy(false);
    if (error) return setErr(error.message);
    if (!data.ok) return setErr(data.error);
    setInfo(data); setLeft(data.expires_in); setWait(30); setOtp(''); setMode('otp');
  };

  const change = async () => {
    setErr('');
    if (!/^\d{6}$/.test(otp)) return setErr('Enter the 6-digit code.');
    if (!/^\d{4}$/.test(n1)) return setErr('New PIN must be exactly 4 digits.');
    if (n1 !== n2) return setErr('New PINs do not match.');
    setBusy(true);
    const { data, error } = await supabase.rpc('change_my_pin', { p_old_pin: old, p_otp: otp, p_new_pin: n1 });
    setBusy(false);
    if (error) return setErr(error.message);
    if (!data.ok) return setErr(data.error);
    reset(); setMsg('Your transaction PIN was changed.'); onChanged && onChanged();
  };

  return (
    <div className="ot-card">
      <div className="ot-row"><b>Transaction PIN</b><span className={'st-tag' + (hasPin ? '' : ' warn')}>{hasPin ? 'Set' : 'Not set'}</span></div>
      {msg && <div className="st-toast" style={{ marginTop: 10 }}>{msg}</div>}

      {!hasPin && <>
        <label className="ot-lab" style={{ marginTop: 10 }}>Create a 4-digit PIN</label>
        <input className="ot-input" type="password" inputMode="numeric" maxLength={4} value={n1} onChange={only(4, setN1)} />
        <label className="ot-lab">Confirm PIN</label>
        <input className="ot-input" type="password" inputMode="numeric" maxLength={4} value={n2} onChange={only(4, setN2)} />
        {err && <p className="ot-err" role="alert">{err}</p>}
        <button className="ot-btn" disabled={busy} onClick={setFirst}>{busy ? 'Saving...' : 'Set PIN'}</button>
      </>}

      {hasPin && mode === 'idle' && <>
        <p className="ot-mut" style={{ margin: '8px 0 0' }}>To change your PIN you'll need your current PIN and a code sent to your phone number.</p>
        <button className="ot-btn ot-alt" onClick={() => { setMode('old'); setMsg(''); }}>Change PIN</button>
      </>}

      {hasPin && mode === 'old' && <>
        <label className="ot-lab" style={{ marginTop: 10 }}>Step 1 · Enter your current PIN</label>
        <input className="ot-input" type="password" inputMode="numeric" maxLength={4} autoFocus value={old} onChange={only(4, setOld)} />
        {err && <p className="ot-err" role="alert">{err}</p>}
        <button className="ot-btn" disabled={busy} onClick={sendCode}>{busy ? 'Checking...' : 'Send code to my phone'}</button>
        <button className="ot-btn ot-alt" onClick={reset}>Cancel</button>
      </>}

      {hasPin && mode === 'otp' && info && <>
        <p className="ot-mut" style={{ margin: '10px 0 8px' }}>Step 2 · We sent a 6-digit code to <b>{info.sent_to}</b>. {left > 0 ? `It expires in ${mmss(left)}.` : 'It has expired. Request a new one.'}</p>
        {info.demo_code && <div className="st-toast">Demo mode: SMS isn't connected, so your code is <b>{info.demo_code}</b>. It also appears in your notifications.</div>}
        <label className="ot-lab">Verification code</label>
        <input className="ot-input" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={otp} onChange={only(6, setOtp)} placeholder="6-digit code" />
        <label className="ot-lab">New PIN</label>
        <input className="ot-input" type="password" inputMode="numeric" maxLength={4} value={n1} onChange={only(4, setN1)} />
        <label className="ot-lab">Confirm new PIN</label>
        <input className="ot-input" type="password" inputMode="numeric" maxLength={4} value={n2} onChange={only(4, setN2)} />
        {err && <p className="ot-err" role="alert">{err}</p>}
        <button className="ot-btn" disabled={busy} onClick={change}>{busy ? 'Changing...' : 'Change PIN'}</button>
        <button className="ot-btn ot-alt" disabled={busy || wait > 0} onClick={sendCode}>{wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}</button>
        <button className="ot-btn ot-alt" onClick={reset}>Cancel</button>
      </>}
    </div>
  );
}
