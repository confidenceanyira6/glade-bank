import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import { CUR, ORDER, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../transfer/common.js';
import { submitKyc, submitKycTier3 } from '../kycApi.js';
import PinChange from './PinChange.jsx';
import '../transfer/transfer.css';
import '../transfer/wallets.css';
import './settings.css';

const COUNTRIES = [['NG', 'Nigeria'], ['GB', 'United Kingdom'], ['US', 'United States'], ['CA', 'Canada'], ['GH', 'Ghana'], ['ZA', 'South Africa'], ['DE', 'Germany'], ['FR', 'France'], ['IE', 'Ireland']];
// '#/' returns to the main app, which reopens the Profile screen it was last on.
const home = () => { location.hash = '#/'; };

function useAuth() {
  const [u, setU] = useState(undefined);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setU(data.session ? data.session.user : null)); }, []);
  return u;
}
function Page({ title, children, onBack }) {
  return (
    <div className="ot"><div className="ot-wrap">
      <div className="ot-head"><button onClick={onBack || home} aria-label="Back">←</button><h2>{title}</h2><span /></div>
      {children}
    </div></div>
  );
}
function Gate({ u, title, children, onBack }) {
  if (u === undefined) return <Page title={title} onBack={onBack}><p className="ot-mut">Loading...</p></Page>;
  if (u === null) return <Page title={title} onBack={onBack}><div className="ot-card"><p>Log in to continue.</p><a className="ot-btn" href="#/login">Log in</a></div></Page>;
  return <Page title={title} onBack={onBack}>{children}</Page>;
}
const Switch = ({ on, onChange, label }) => <button type="button" role="switch" aria-checked={on} aria-label={label} className={'st-sw' + (on ? ' on' : '')} onClick={() => onChange(!on)} />;
const initials = n => (n || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const Msg = ({ msg, err }) => <>{msg && <div className="st-toast">{msg}</div>}{err && <p className="ot-err" role="alert">{err}</p>}</>;

// Settings load/save with optimistic updates.
function useSettings(u) {
  const [s, setS] = useState(DEFAULT_SETTINGS);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  useEffect(() => { if (u) loadSettings().then(x => x && setS(x)); }, [u]);
  const update = async patch => {
    const prev = s; setS({ ...s, ...patch }); setErr(''); setMsg('');
    const { error } = await saveSettings(patch);
    if (error) { setS(prev); setErr(error.message); } else setMsg('Saved');
  };
  return [s, update, msg, err];
}

/* ---------- Personal Information ---------- */
export function Personal() {
  const u = useAuth();
  const [f, setF] = useState({ name: '', phone: '', country: 'NG' });
  const [ver, setVer] = useState(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!u) return;
    (async () => {
      const { data: p } = await supabase.from('profiles').select('full_name,phone,country_of_residence').eq('id', u.id).maybeSingle();
      setF({ name: (p && p.full_name) || '', phone: (p && p.phone) || '', country: (p && p.country_of_residence) || 'NG' });
      const { data: v } = await supabase.from('customer_verifications').select('status,date_of_birth,address_line1,city,region').eq('user_id', u.id).maybeSingle();
      setVer(v);
    })();
  }, [u]);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async () => {
    setErr(''); setMsg(''); setBusy(true);
    const { error } = await supabase.rpc('update_my_profile', { p_full_name: f.name, p_phone: f.phone, p_country: f.country });
    setBusy(false);
    if (error) return setErr(error.message);
    setMsg('Your details were saved.');
  };
  return (
    <Gate u={u} title="Personal Information">
      <div className="st-av">{initials(f.name)}</div>
      <div className="st-name"><b>{f.name || 'Your name'}</b><small>{u && u.email}</small></div>
      <div className="ot-card">
        <label className="ot-lab">Full name</label>
        <input className="ot-input" value={f.name} onChange={set('name')} autoComplete="name" />
        <label className="ot-lab">Email</label>
        <input className="ot-input" value={(u && u.email) || ''} readOnly style={{ opacity: .7 }} />
        <label className="ot-lab">Phone number</label>
        <input className="ot-input" type="tel" value={f.phone} onChange={set('phone')} placeholder="+234 801 234 5678" autoComplete="tel" />
        <label className="ot-lab">Country of residence</label>
        <select className="st-sel" value={f.country} onChange={set('country')}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
      </div>
      {ver && ver.status === 'verified' && (
        <div className="ot-card">
          <div className="ot-row"><b>Verified identity details</b><span className="st-tag">Verified</span></div>
          {ver.date_of_birth && <div className="ot-kv"><span>Date of birth</span><b>{ver.date_of_birth}</b></div>}
          {ver.address_line1 && <div className="ot-kv"><span>Address</span><b>{[ver.address_line1, ver.city, ver.region].filter(Boolean).join(', ')}</b></div>}
          <p className="ot-mut" style={{ margin: '6px 0 0' }}>To change these, update them in Verification.</p>
        </div>
      )}
      <Msg msg={msg} err={err} />
      <button className="ot-btn" disabled={busy} onClick={save}>{busy ? 'Saving...' : 'Save changes'}</button>
    </Gate>
  );
}

/* ---------- Security Settings ---------- */
export function Security() {
  const u = useAuth();
  const [s, update, smsg, serr] = useSettings(u);
  const [pw, setPw] = useState({ a: '', b: '' });
  const [hasPin, setHasPin] = useState(false);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  useEffect(() => { if (u) supabase.rpc('has_my_pin').then(({ data }) => setHasPin(!!data)); }, [u]);

  const changePw = async () => {
    setErr(''); setMsg('');
    if (pw.a.length < 6) return setErr('Password must be at least 6 characters.');
    if (pw.a !== pw.b) return setErr('Passwords do not match.');
    setBusy('pw');
    const { error } = await supabase.auth.updateUser({ password: pw.a });
    setBusy('');
    if (error) return setErr(error.message);
    setPw({ a: '', b: '' }); setMsg('Password changed.');
  };
  const signOutAll = async () => {
    setBusy('out');
    await supabase.auth.signOut({ scope: 'global' });
    sessionStorage.setItem('gb', 'welcome'); location.hash = '#/login';
  };

  return (
    <Gate u={u} title="Security Settings">
      <Msg msg={msg || smsg} err={err || serr} />
      <div className="ot-card">
        <b>Change password</b>
        <label className="ot-lab" style={{ marginTop: 10 }}>New password</label>
        <input className="ot-input" type="password" autoComplete="new-password" value={pw.a} onChange={e => setPw({ ...pw, a: e.target.value })} />
        <label className="ot-lab">Confirm new password</label>
        <input className="ot-input" type="password" autoComplete="new-password" value={pw.b} onChange={e => setPw({ ...pw, b: e.target.value })} />
        <button className="ot-btn" disabled={busy === 'pw'} onClick={changePw}>{busy === 'pw' ? 'Updating...' : 'Update password'}</button>
      </div>
      <PinChange hasPin={hasPin} onChanged={() => setHasPin(true)} />
      <div className="ot-card">
        <div className="st-item"><div className="t"><b>Login alerts</b><small>Get notified when your account is accessed from a new device.</small></div><Switch label="Login alerts" on={s.login_alerts} onChange={v => update({ login_alerts: v })} /></div>
        <div className="st-item" style={{ cursor: 'pointer' }} onClick={() => { location.hash = '#/twofa'; }}><div className="t"><b>Two-factor authentication</b><small>{s.two_factor ? 'On' : 'Off'}</small></div><span>›</span></div>
      </div>
      <button className="ot-btn ot-alt" disabled={busy === 'out'} onClick={signOutAll}>Log out of all devices</button>
    </Gate>
  );
}

/* ---------- Two-Factor Authentication ---------- */
export function TwoFA() {
  const u = useAuth();
  const [s, update, msg, err] = useSettings(u);
  const M = [['authenticator', '📱', 'Authenticator app', 'Use a code from an app like Google Authenticator.'], ['sms', '💬', 'SMS', 'Get a code by text message.'], ['email', '✉️', 'Email', 'Get a code at your email address.']];
  return (
    <Gate u={u} title="Two-Factor Authentication" onBack={() => { location.hash = '#/security'; }}>
      <div className="ot-card">
        <div className="st-item"><div className="t"><b>Two-factor authentication</b><small>Adds an extra step to confirm sensitive actions on your account.</small></div><Switch label="Two-factor authentication" on={s.two_factor} onChange={v => update({ two_factor: v })} /></div>
      </div>
      <div className="st-h">Verification method</div>
      {M.map(([k, ic, t, d]) => (
        <button key={k} type="button" className={'wl-acct' + (s.two_factor_method === k ? ' sel' : '')} onClick={() => update({ two_factor_method: k })}>
          <div className="wl-top"><span className="wl-flag">{ic}</span><div><b>{t}</b><small>{d}</small></div></div>
        </button>
      ))}
      <Msg msg={msg} err={err} />
      <p className="ot-demo">This preference is saved to your account. Sign-in stays email and password only in this demo.</p>
    </Gate>
  );
}

/* ---------- Notification Preferences ---------- */
export function Notify() {
  const u = useAuth();
  const [s, update, msg, err] = useSettings(u);
  const tog = k => v => update({ notify: { ...s.notify, [k]: v } });
  const T = [['transactions', 'Transactions', 'Money in, money out and transfer status.'], ['security', 'Security alerts', 'Logins, password and PIN changes.'], ['updates', 'Account updates', 'Verification, limits and statements.'], ['promotions', 'Offers and promotions', 'Rewards, investment offers and news.']];
  const C = [['push', 'Push notifications'], ['email', 'Email notifications']];
  return (
    <Gate u={u} title="Notification Preferences">
      <Msg msg={msg} err={err} />
      <div className="st-h" style={{ marginTop: 0 }}>What to notify me about</div>
      <div className="ot-card">{T.map(([k, t, d]) => <div className="st-item" key={k}><div className="t"><b>{t}</b><small>{d}</small></div><Switch label={t} on={!!s.notify[k]} onChange={tog(k)} /></div>)}</div>
      <div className="st-h">How to reach me</div>
      <div className="ot-card">{C.map(([k, t]) => <div className="st-item" key={k}><div className="t"><b>{t}</b></div><Switch label={t} on={!!s.notify[k]} onChange={tog(k)} /></div>)}</div>
    </Gate>
  );
}

/* ---------- Currency Preferences ---------- */
export function Currency() {
  const u = useAuth();
  const [s, update, msg, err] = useSettings(u);
  return (
    <Gate u={u} title="Currency Preferences">
      <p className="ot-mut" style={{ margin: '0 2px 12px' }}>Choose your main currency. Its account is the one shown first on your Home screen.</p>
      {ORDER.map(c => (
        <button key={c} type="button" className={'wl-acct' + (s.base_currency === c ? ' sel' : '')} onClick={() => update({ base_currency: c })}>
          <div className="wl-top"><span className="wl-flag">{CUR[c].flag}</span><div><b>{CUR[c].name}</b><small>{CUR[c].country} · {c}</small></div><div className="wl-bal">{s.base_currency === c ? '✓' : ''}</div></div>
        </button>
      ))}
      <Msg msg={msg} err={err} />
    </Gate>
  );
}

/* ---------- Verification (KYC) ---------- */
// Level 1 = normal (email + phone, everyone). Level 2 = BVN (free account number). Level 3 = NIN + ID.
// These amounts are display text only; they are not enforced by the database yet.
const LIMITS = { 1: '₦50,000 per day', 2: '₦200,000 per day', 3: '₦5,000,000 per day' };
const STATUS = { not_started: ['Not started', 'warn'], pending: ['Under review', 'warn'], verified: ['Verified', ''], rejected: ['Rejected', 'bad'], additional_info_required: ['More info needed', 'warn'] };
const ID_TYPES_NG = ['National ID (NIN slip)', "Driver's licence", 'International passport', "Voter's card"];
const ID_TYPES_OTHER = ['International passport', "Driver's licence", 'National ID card'];
// Calling codes for the countries we can open accounts in. A country missing here cannot verify yet.
const CALLING = { NG: '234', US: '1' };
// National number only: strip spaces/symbols, a leading country code (when the number is clearly too long) and Nigeria's leading 0.
const nationalPhone = (v, cc) => {
  let d = String(v || '').replace(/\D/g, ''); const code = CALLING[cc];
  if (code && d.startsWith(code) && d.length > 10) d = d.slice(code.length);
  if (cc === 'NG' && d.startsWith('0')) d = d.slice(1);
  return d;
};

export function Kyc() {
  const u = useAuth();
  const [ver, setVer] = useState(undefined);
  const [sub, setSub] = useState({});
  const [countries, setCountries] = useState([['NG', 'Nigeria']]);
  const [wiz, setWiz] = useState(null); // null | 'l2' (BVN) | 'l3' (NIN + ID)
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ bvn: '', nin: '', idType: ID_TYPES_NG[0], idNo: '', name: '', dob: '', phone: '', address: '', city: '', region: '', postal: '', country: 'NG', ok: false });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const isNG = f.country === 'NG';
  const idTypes = isNG ? ID_TYPES_NG : ID_TYPES_OTHER;

  const load = async () => {
    const { data: v } = await supabase.from('customer_verifications').select('*').eq('user_id', u.id).maybeSingle();
    setVer(v || { status: 'not_started', kyc_tier: 1 });
    const { data: k } = await supabase.from('kyc_submissions').select('bvn_last4,nin_last4,id_type').eq('user_id', u.id).order('created_at', { ascending: false }).limit(5);
    const pickLast = key => { const r = (k || []).find(x => x[key]); return r ? r[key] : null; };
    setSub({ bvn_last4: pickLast('bvn_last4'), nin_last4: pickLast('nin_last4') });
    const { data: p } = await supabase.from('profiles').select('full_name,phone').eq('id', u.id).maybeSingle();
    setF(x => ({ ...x, name: x.name || (v && v.legal_name) || (p && p.full_name) || '', phone: x.phone || (p && p.phone) || '' }));
    // Only countries we can actually open accounts in (Maplerad-supported, from country_account_catalog).
    const { data: c } = await supabase.from('country_account_catalog').select('country,country_name').order('sort_order');
    if (c && c.length) { const m = new Map(); c.forEach(r => m.set(r.country, r.country_name)); setCountries([...m.entries()]); }
  };
  useEffect(() => { if (u) load(); }, [u]);

  const status = ver ? ver.status : 'not_started';
  const tier = status === 'verified' ? (ver.kyc_tier || 2) : 1;
  const homeCountry = (ver && ver.country_of_residence) || 'NG';

  const next = () => {
    setErr('');
    if (step === 1) {
      if (!CALLING[f.country]) return setErr('We cannot verify customers in this country yet.');
      if (isNG && !/^\d{11}$/.test(f.bvn)) return setErr('BVN must be 11 digits.');
      if (!isNG && f.idNo.trim().length < 5) return setErr('Enter your ID number.');
    }
    if (step === 2) {
      if (f.name.trim().length < 3) return setErr('Enter your full legal name.');
      if (!f.dob) return setErr('Enter your date of birth.');
      const p = nationalPhone(f.phone, f.country);
      if (isNG ? p.length !== 10 : (p.length < 7 || p.length > 12)) return setErr('Enter a valid phone number.');
    }
    setStep(step + 1);
  };

  // Level 2: BVN (or ID number outside Nigeria). Issues the free account number.
  const submitL2 = async () => {
    setErr('');
    if (f.address.trim().length < 5) return setErr('Enter your residential address.');
    if (!f.ok) return setErr('Please confirm the details are correct.');
    setBusy(true);
    try {
      await submitKyc(supabase, {
        country: f.country, legal_name: f.name, date_of_birth: f.dob,
        ...(isNG ? { bvn: f.bvn } : { id_number: f.idNo.trim() }),
        phone_country_code: '+' + CALLING[f.country], phone_number: nationalPhone(f.phone, f.country),
        address: { street: f.address, city: f.city, state: f.region, postal_code: f.postal },
      });
      setWiz(null); setStep(1);
    } catch (e) { setErr(e.message); }
    setBusy(false); load();
  };

  // Level 3: NIN + government ID.
  const submitL3 = async () => {
    setErr('');
    if (!/^\d{11}$/.test(f.nin)) return setErr('NIN must be 11 digits.');
    if (f.idNo.trim().length < 5) return setErr('Enter your ID number.');
    if (!f.ok) return setErr('Please confirm the details are correct.');
    setBusy(true);
    try {
      await submitKycTier3(supabase, { nin: f.nin, id_type: f.idType, id_number: f.idNo.trim() });
      setWiz(null);
    } catch (e) { setErr(e.message); }
    setBusy(false); load();
  };
  const st = STATUS[status] || STATUS.not_started;

  if (wiz === 'l3') {
    return (
      <Gate u={u} title="Level 3 verification" onBack={() => setWiz(null)}>
        <div className="ot-card">
          <b>NIN and government ID</b>
          <label className="ot-lab" style={{ marginTop: 10 }}>NIN (11 digits)</label>
          <input className="ot-input" inputMode="numeric" maxLength={11} value={f.nin} onChange={e => setF({ ...f, nin: e.target.value.replace(/\D/g, '') })} />
          <label className="ot-lab">ID type</label>
          <select className="st-sel" value={f.idType} onChange={set('idType')}>{ID_TYPES_NG.map(t => <option key={t}>{t}</option>)}</select>
          <label className="ot-lab">ID number</label>
          <input className="ot-input" value={f.idNo} onChange={set('idNo')} />
          <label className="st-check"><input type="checkbox" checked={f.ok} onChange={set('ok')} /><span>I confirm these details are correct.</span></label>
        </div>
        {err && <p className="ot-err" role="alert">{err}</p>}
        <button className="ot-btn" disabled={busy} onClick={submitL3}>{busy ? 'Submitting...' : 'Verify Level 3'}</button>
        <p className="ot-demo">Your NIN and ID number are sent securely to our banking partner and are not stored by Glade Bank.</p>
      </Gate>
    );
  }

  if (wiz === 'l2') {
    return (
      <Gate u={u} title="Level 2 verification" onBack={() => { if (step > 1) setStep(step - 1); else setWiz(null); }}>
        <div className="st-steps">{[1, 2, 3].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        {step === 1 && <div className="ot-card">
          <b>Step 1 of 3 · {isNG ? 'BVN' : 'Identity'}</b>
          <label className="ot-lab" style={{ marginTop: 10 }}>Country you live in</label>
          <select className="st-sel" value={f.country} onChange={e => setF({ ...f, country: e.target.value, idType: (e.target.value === 'NG' ? ID_TYPES_NG : ID_TYPES_OTHER)[0] })}>{countries.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          {isNG ? <>
            <label className="ot-lab">BVN (11 digits)</label>
            <input className="ot-input" inputMode="numeric" maxLength={11} value={f.bvn} onChange={e => setF({ ...f, bvn: e.target.value.replace(/\D/g, '') })} />
          </> : <>
            <label className="ot-lab">ID type</label>
            <select className="st-sel" value={f.idType} onChange={set('idType')}>{idTypes.map(t => <option key={t}>{t}</option>)}</select>
            <label className="ot-lab">ID number</label>
            <input className="ot-input" value={f.idNo} onChange={set('idNo')} />
          </>}
        </div>}
        {step === 2 && <div className="ot-card">
          <b>Step 2 of 3 · Personal details</b>
          <label className="ot-lab" style={{ marginTop: 10 }}>Full legal name (as on your ID)</label>
          <input className="ot-input" value={f.name} onChange={set('name')} />
          <label className="ot-lab">Date of birth</label>
          <input className="ot-input" type="date" value={f.dob} onChange={set('dob')} />
          <label className="ot-lab">Phone number (+{CALLING[f.country] || ''})</label>
          <input className="ot-input" type="tel" value={f.phone} onChange={set('phone')} placeholder={isNG ? '0801 234 5678' : 'Phone number'} autoComplete="tel" />
        </div>}
        {step === 3 && <div className="ot-card">
          <b>Step 3 of 3 · Address</b>
          <label className="ot-lab" style={{ marginTop: 10 }}>Residential address</label>
          <input className="ot-input" value={f.address} onChange={set('address')} />
          <label className="ot-lab">City</label>
          <input className="ot-input" value={f.city} onChange={set('city')} />
          <label className="ot-lab">State / region</label>
          <input className="ot-input" value={f.region} onChange={set('region')} />
          <label className="ot-lab">Postal code</label>
          <input className="ot-input" value={f.postal} onChange={set('postal')} />
          <label className="st-check"><input type="checkbox" checked={f.ok} onChange={set('ok')} /><span>I confirm these details are correct.</span></label>
        </div>}
        {err && <p className="ot-err" role="alert">{err}</p>}
        {step < 3 ? <button className="ot-btn" onClick={next}>Continue</button> : <button className="ot-btn" disabled={busy} onClick={submitL2}>{busy ? 'Submitting...' : 'Verify Level 2'}</button>}
        <p className="ot-demo">Your BVN or ID number is sent securely to our banking partner and is not stored by Glade Bank. After this step you get a free account number for your country.</p>
      </Gate>
    );
  }

  const tiers = [
    [1, 'Level 1 · Normal', 'Sign up with your email and phone number', true],
    [2, 'Level 2 · BVN', 'BVN, date of birth and address. Gives you your free account number', tier >= 2],
    [3, 'Level 3 · NIN and ID', 'NIN and government ID for the highest limits', tier >= 3],
  ];
  return (
    <Gate u={u} title="Verification Status">
      {ver === undefined ? <p className="ot-mut">Loading...</p> : <>
        <div className="ot-card ot-center" style={{ padding: 22 }}>
          <div className="ot-check" style={{ margin: '0 auto 8px', background: status === 'verified' ? undefined : '#f59e0b' }}>{status === 'verified' ? '✓' : '!'}</div>
          <span className={'st-tag ' + st[1]}>{st[0]}</span>
          <h3 style={{ margin: '10px 0 4px' }}>Level {tier} account</h3>
          <p className="ot-mut" style={{ margin: 0 }}>Daily limit: {LIMITS[tier]}</p>
          {(status === 'rejected' || status === 'additional_info_required') && ver.rejection_reason && <p className="ot-err">{ver.rejection_reason}</p>}
        </div>
        {tiers.map(([n, t, d, done]) => <div key={n} className={'st-tier' + (done ? ' done' : '')}><span className="n">{done ? '✓' : n}</span><div><b>{t}</b><small>{d}</small><small>Limit: {LIMITS[n]}</small></div></div>)}
        {status === 'verified' && ver && (
          <div className="ot-card">
            <div className="ot-kv"><span>Legal name</span><b>{ver.legal_name}</b></div>
            {ver.date_of_birth && <div className="ot-kv"><span>Date of birth</span><b>{ver.date_of_birth}</b></div>}
            {ver.address_line1 && <div className="ot-kv"><span>Address</span><b>{[ver.address_line1, ver.city, ver.region].filter(Boolean).join(', ')}</b></div>}
            {sub.bvn_last4 && <div className="ot-kv"><span>BVN</span><b>*******{sub.bvn_last4}</b></div>}
            {sub.nin_last4 && <div className="ot-kv"><span>NIN</span><b>*******{sub.nin_last4}</b></div>}
          </div>
        )}
        {status === 'pending' && <p className="ot-mut" style={{ textAlign: 'center' }}>We're reviewing your details. You'll be notified when it's done.</p>}
        {status !== 'verified' && status !== 'pending' && <button className="ot-btn" onClick={() => { setWiz('l2'); setStep(1); setErr(''); }}>{status === 'not_started' ? 'Start Level 2 (BVN)' : 'Update and resubmit Level 2'}</button>}
        {status === 'verified' && tier < 3 && homeCountry === 'NG' && <button className="ot-btn" onClick={() => { setWiz('l3'); setErr(''); setF(x => ({ ...x, ok: false, idNo: '' })); }}>Upgrade to Level 3 (NIN)</button>}
        {status === 'verified' && tier < 3 && homeCountry !== 'NG' && <p className="ot-mut" style={{ textAlign: 'center' }}>Level 3 is not available in your country yet.</p>}
      </>}
    </Gate>
  );
}

/* ---------- All Services ---------- */
const SECTIONS = [
  ['Send and receive', [['🏦', 'To bank', '#/local'], ['🔁', 'Move money', '#/move'], ['🌍', 'International', 'transfer'], ['📥', 'Receive', '#/accounts'], ['💱', 'Exchange', 'fx'], ['👥', 'Beneficiaries', 'benef']]],
  ['Pay bills', [['📱', 'Airtime', '#/bills'], ['📶', 'Data', '#/bills'], ['💡', 'Electricity', '#/bills'], ['📺', 'Cable TV', '#/bills']]],
  ['Manage money', [['🏧', 'My accounts', '#/accounts'], ['💳', 'Cards', '#/cards'], ['🧾', 'Statements', '#/statements'], ['📊', 'Limits', '#/limits'], ['📈', 'Invest', 'invest'], ['📜', 'History', 'history']]],
  ['Account and help', [['✅', 'Verification', '#/kyc'], ['🛡️', 'Security', '#/security'], ['🔔', 'Alerts', '#/notify'], ['💬', 'Support', '#/support']]],
];
const open = t => () => { if (t.startsWith('#')) { location.hash = t; } else { sessionStorage.setItem('gb', t); location.hash = '#/'; } };

export function Services() {
  return (
    <Page title="All Services">
      {SECTIONS.map(([h, items]) => (
        <div key={h} className="ot-card">
          <div className="st-h" style={{ margin: '0 0 14px' }}>{h}</div>
          <div className="st-grid">{items.map(([ic, t, to]) => <button key={t} onClick={open(to)}><i>{ic}</i>{t}</button>)}</div>
        </div>
      ))}
    </Page>
  );
}
