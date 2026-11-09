import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import { CUR, ORDER, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../transfer/common.js';
import { submitKyc } from '../kycApi.js';
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
const LIMITS = { 1: '₦50,000 per day', 2: '₦200,000 per day', 3: '₦5,000,000 per day' };
const STATUS = { not_started: ['Not started', 'warn'], pending: ['Under review', 'warn'], verified: ['Verified', ''], rejected: ['Rejected', 'bad'], additional_info_required: ['More info needed', 'warn'] };
const ID_TYPES = ['National ID (NIN slip)', "Driver's licence", 'International passport', "Voter's card"];
// Nigerian numbers: strip spaces, a leading +234/234 or a leading 0, keep the 10-digit national number.
const nigerianPhone = v => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('234')) d = d.slice(3); if (d.startsWith('0')) d = d.slice(1); return d; };

export function Kyc() {
  const u = useAuth();
  const [ver, setVer] = useState(undefined);
  const [sub, setSub] = useState(null);
  const [wiz, setWiz] = useState(false);
  const [step, setStep] = useState(1);
  const [f, setF] = useState({ bvn: '', nin: '', idType: ID_TYPES[0], idNo: '', name: '', dob: '', phone: '', address: '', city: '', region: '', postal: '', country: 'NG', ok: false });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const load = async () => {
    const { data: v } = await supabase.from('customer_verifications').select('*').eq('user_id', u.id).maybeSingle();
    setVer(v || { status: 'not_started' });
    const { data: k } = await supabase.from('kyc_submissions').select('bvn_last4,nin_last4,id_type').eq('user_id', u.id).order('created_at', { ascending: false }).limit(1);
    setSub(k && k[0]);
    const { data: p } = await supabase.from('profiles').select('full_name,phone').eq('id', u.id).maybeSingle();
    setF(x => ({ ...x, name: x.name || (v && v.legal_name) || (p && p.full_name) || '', phone: x.phone || (p && p.phone) || '' }));
  };
  useEffect(() => { if (u) load(); }, [u]);

  const status = ver ? ver.status : 'not_started';
  const level = status === 'verified' ? 3 : 1;
  const next = () => {
    setErr('');
    if (step === 1) {
      if (!/^\d{11}$/.test(f.bvn)) return setErr('BVN must be 11 digits.');
      if (!/^\d{11}$/.test(f.nin)) return setErr('NIN must be 11 digits.');
      if (f.idNo.trim().length < 5) return setErr('Enter your ID number.');
    }
    if (step === 2) {
      if (f.name.trim().length < 3) return setErr('Enter your full legal name.');
      if (!f.dob) return setErr('Enter your date of birth.');
      const p = nigerianPhone(f.phone);
      if (p.length < 10 || p.length > 11) return setErr('Enter a valid phone number.');
    }
    setStep(step + 1);
  };
  const submit = async () => {
    setErr('');
    if (f.address.trim().length < 5) return setErr('Enter your residential address.');
    if (!f.ok) return setErr('Please confirm the details are correct.');
    setBusy(true);
    let error = null;
    try {
      // Real verification: banking partner (Maplerad) via the kyc-submit Edge Function.
      await submitKyc(supabase, {
        legal_name: f.name, date_of_birth: f.dob, bvn: f.bvn,
        phone_country_code: '+234', phone_number: nigerianPhone(f.phone),
        address: { street: f.address, city: f.city, state: f.region, postal_code: f.postal },
      });
    } catch (e) {
      if (e.code === 'provider_not_configured' || e.code === 'function_unavailable') {
        // Partner not set up yet: the database decides (demo mode verifies instantly, production refuses).
        const r = await supabase.rpc('submit_my_kyc', { p_legal_name: f.name, p_dob: f.dob, p_address: f.address, p_city: f.city, p_region: f.region, p_postal: f.postal, p_country: f.country, p_id_type: f.idType, p_id_number: f.idNo, p_bvn: f.bvn, p_nin: f.nin });
        error = r.error;
      } else error = e;
    }
    setBusy(false);
    if (error) { setErr(error.message); load(); return; }
    setWiz(false); setStep(1); load();
  };
  const st = STATUS[status] || STATUS.not_started;

  if (wiz) {
    return (
      <Gate u={u} title="Verify your identity" onBack={() => { if (step > 1) setStep(step - 1); else setWiz(false); }}>
        <div className="st-steps">{[1, 2, 3].map(i => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        {step === 1 && <div className="ot-card">
          <b>Step 1 of 3 · Identity numbers</b>
          <label className="ot-lab" style={{ marginTop: 10 }}>BVN (11 digits)</label>
          <input className="ot-input" inputMode="numeric" maxLength={11} value={f.bvn} onChange={e => setF({ ...f, bvn: e.target.value.replace(/\D/g, '') })} />
          <label className="ot-lab">NIN (11 digits)</label>
          <input className="ot-input" inputMode="numeric" maxLength={11} value={f.nin} onChange={e => setF({ ...f, nin: e.target.value.replace(/\D/g, '') })} />
          <label className="ot-lab">ID type</label>
          <select className="st-sel" value={f.idType} onChange={set('idType')}>{ID_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <label className="ot-lab">ID number</label>
          <input className="ot-input" value={f.idNo} onChange={set('idNo')} />
        </div>}
        {step === 2 && <div className="ot-card">
          <b>Step 2 of 3 · Personal details</b>
          <label className="ot-lab" style={{ marginTop: 10 }}>Full legal name (as on your ID)</label>
          <input className="ot-input" value={f.name} onChange={set('name')} />
          <label className="ot-lab">Date of birth</label>
          <input className="ot-input" type="date" value={f.dob} onChange={set('dob')} />
          <label className="ot-lab">Phone number</label>
          <input className="ot-input" type="tel" value={f.phone} onChange={set('phone')} placeholder="0801 234 5678" autoComplete="tel" />
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
          <label className="ot-lab">Country</label>
          <select className="st-sel" value={f.country} onChange={set('country')}>{COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
          <label className="st-check"><input type="checkbox" checked={f.ok} onChange={set('ok')} /><span>I confirm these details are correct.</span></label>
        </div>}
        {err && <p className="ot-err" role="alert">{err}</p>}
        {step < 3 ? <button className="ot-btn" onClick={next}>Continue</button> : <button className="ot-btn" disabled={busy} onClick={submit}>{busy ? 'Submitting...' : 'Submit for verification'}</button>}
        <p className="ot-demo">Your BVN is sent securely to our banking partner and is not stored by Glade Bank.</p>
      </Gate>
    );
  }

  const tiers = [[1, 'Level 1 · Basic', 'Email and phone number', true], [2, 'Level 2 · BVN and NIN', 'Confirm your BVN and NIN', status === 'verified'], [3, 'Level 3 · ID and address', 'Government ID and proof of address', status === 'verified']];
  return (
    <Gate u={u} title="Verification Status">
      {ver === undefined ? <p className="ot-mut">Loading...</p> : <>
        <div className="ot-card ot-center" style={{ padding: 22 }}>
          <div className="ot-check" style={{ margin: '0 auto 8px', background: status === 'verified' ? undefined : '#f59e0b' }}>{status === 'verified' ? '✓' : '!'}</div>
          <span className={'st-tag ' + st[1]}>{st[0]}</span>
          <h3 style={{ margin: '10px 0 4px' }}>Level {level} account</h3>
          <p className="ot-mut" style={{ margin: 0 }}>Daily limit: {LIMITS[level]}</p>
          {(status === 'rejected' || status === 'additional_info_required') && ver.rejection_reason && <p className="ot-err">{ver.rejection_reason}</p>}
        </div>
        {tiers.map(([n, t, d, done]) => <div key={n} className={'st-tier' + (done ? ' done' : '')}><span className="n">{done ? '✓' : n}</span><div><b>{t}</b><small>{d}</small><small>Limit: {LIMITS[n]}</small></div></div>)}
        {status === 'verified' && ver && (
          <div className="ot-card">
            <div className="ot-kv"><span>Legal name</span><b>{ver.legal_name}</b></div>
            {ver.date_of_birth && <div className="ot-kv"><span>Date of birth</span><b>{ver.date_of_birth}</b></div>}
            {ver.address_line1 && <div className="ot-kv"><span>Address</span><b>{[ver.address_line1, ver.city, ver.region].filter(Boolean).join(', ')}</b></div>}
            {sub && sub.bvn_last4 && <div className="ot-kv"><span>BVN</span><b>*******{sub.bvn_last4}</b></div>}
            {sub && sub.nin_last4 && <div className="ot-kv"><span>NIN</span><b>*******{sub.nin_last4}</b></div>}
          </div>
        )}
        {status === 'pending' && <p className="ot-mut" style={{ textAlign: 'center' }}>We're reviewing your details. You'll be notified when it's done.</p>}
        {status !== 'verified' && status !== 'pending' && <button className="ot-btn" onClick={() => { setWiz(true); setStep(1); setErr(''); }}>{status === 'not_started' ? 'Start verification' : 'Update and resubmit'}</button>}
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
