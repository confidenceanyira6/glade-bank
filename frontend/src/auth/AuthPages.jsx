import React, { useState } from 'react';
import { supabase } from './supabase.js';
import './auth.css';

// Base App reads this key on mount to decide which screen to open.
const goHome = () => { sessionStorage.setItem('gb', 'home'); location.hash = '#/'; };

const DUP_MSG = 'An account with this email already exists. Log in instead, or use a different email.';

function Shell({ title, sub, children, foot }) {
  return (
    <div className="op">
      <div className="op-card">
        <div className="op-logo"><span>G</span>Glade Bank</div>
        <h1>{title}</h1>
        <p className="op-sub">{sub}</p>
        {children}
        <div className="op-foot">{foot}</div>
      </div>
    </div>
  );
}

const Input = ({ label, ...p }) => (
  <label className="op-field"><span>{label}</span><div className="op-in"><input {...p} /></div></label>
);

function Password({ label, ...p }) {
  const [show, setShow] = useState(false);
  return (
    <label className="op-field"><span>{label}</span>
      <div className="op-in">
        <input {...p} type={show ? 'text' : 'password'} />
        <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
      </div>
    </label>
  );
}

export function Login() {
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });

  const submit = async e => {
    e.preventDefault();
    if (!f.email || !f.password) return setMsg('Enter your email and password.');
    setBusy(true); setMsg('');
    // Direct password login. No two-factor / one-time code step.
    const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password });
    setBusy(false);
    if (error) return setMsg(error.message);
    goHome();
  };

  return (
    <Shell title="Log in" sub="Welcome back. Enter your details to continue."
      foot={<>New to Glade Bank? <a href="#/signup">Sign up</a></>}>
      <form onSubmit={submit}>
        <Input label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={set('email')} />
        <Password label="Password" autoComplete="current-password" placeholder="Enter password" value={f.password} onChange={set('password')} />
        <a className="op-link" href="#/forgot">Forgot password?</a>
        <button className="op-btn" disabled={busy}>{busy ? 'Logging in...' : 'Log in'}</button>
        {msg && <p className="op-err" role="alert">{msg}</p>}
      </form>
    </Shell>
  );
}

export function Signup() {
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '', agree: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  // Asks the database whether this inbox already has an account. Gmail dots, +tags and
  // googlemail.com are treated as the same mailbox (see migration 20261111120000).
  // Returns true / false, or null if the check could not run (the database trigger still enforces it).
  const emailIsFree = async email => {
    const { data, error } = await supabase.rpc('email_available', { p_email: email });
    if (error) { console.warn('email_available check failed', error.message); return null; }
    return data === true;
  };

  const submit = async e => {
    e.preventDefault();
    if (!f.name.trim()) return setMsg('Enter your full name.');
    if (!f.email) return setMsg('Enter your email.');
    if (f.password.length < 6) return setMsg('Password must be at least 6 characters.');
    if (f.password !== f.confirm) return setMsg('Passwords do not match.');
    if (!f.agree) return setMsg('Accept the terms to continue.');
    setBusy(true); setMsg('');

    const free = await emailIsFree(f.email.trim());
    if (free === false) { setBusy(false); return setMsg(DUP_MSG); }

    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.password,
      options: { data: { full_name: f.name.trim(), phone: f.phone.trim() } },
    });
    setBusy(false);
    if (error) {
      // The database trigger rejects a second account on the same inbox; Supabase wraps it in a generic message.
      if (/already|registered|database error saving new user/i.test(error.message)) return setMsg(DUP_MSG);
      return setMsg(error.message);
    }
    // With email confirmation on, Supabase hides existing emails by returning a user with no identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return setMsg(DUP_MSG);
    if (data.session) return goHome();
    setOk(true);
  };

  if (ok) {
    return (
      <Shell title="Check your email" sub={`We sent a confirmation link to ${f.email}. Confirm it, then log in.`}
        foot={<a href="#/login">Back to log in</a>}>
        <a className="op-btn op-a" href="#/login">Go to log in</a>
      </Shell>
    );
  }

  return (
    <Shell title="Create account" sub="Open your Glade Bank account in a minute."
      foot={<>Already have an account? <a href="#/login">Log in</a></>}>
      <form onSubmit={submit}>
        <Input label="Full name" autoComplete="name" placeholder="As on your ID" value={f.name} onChange={set('name')} />
        <Input label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={f.email} onChange={set('email')} />
        <Input label="Phone number" type="tel" autoComplete="tel" placeholder="+234 801 234 5678" value={f.phone} onChange={set('phone')} />
        <Password label="Password" autoComplete="new-password" placeholder="At least 6 characters" value={f.password} onChange={set('password')} />
        <Password label="Confirm password" autoComplete="new-password" placeholder="Repeat password" value={f.confirm} onChange={set('confirm')} />
        <label className="op-check"><input type="checkbox" checked={f.agree} onChange={set('agree')} /><span>I agree to the Terms and Privacy Policy</span></label>
        <button className="op-btn" disabled={busy}>{busy ? 'Creating account...' : 'Sign up'}</button>
        {msg && <p className="op-err" role="alert">{msg}</p>}
      </form>
    </Shell>
  );
}
