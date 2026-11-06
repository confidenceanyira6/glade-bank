import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import '../transfer/transfer.css';
import '../transfer/wallets.css';
import '../settings/settings.css';

export const ngn = n => '₦' + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function Page({ title, back = '#/services', children }) {
  return (
    <div className="ot"><div className="ot-wrap">
      <div className="ot-head"><button onClick={() => { location.hash = back; }} aria-label="Back">←</button><h2>{title}</h2><span /></div>
      {children}
    </div></div>
  );
}

// Renders its children only for a signed-in user, so pages can fetch their own data on mount.
export function Gate({ title, back, children }) {
  const [u, setU] = useState(undefined);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => setU(data.session ? data.session.user : null)); }, []);
  if (u === undefined) return <Page title={title} back={back}><p className="ot-mut">Loading...</p></Page>;
  if (u === null) return <Page title={title} back={back}><div className="ot-card"><p>Log in to continue.</p><a className="ot-btn" href="#/login">Log in</a></div></Page>;
  return <Page title={title} back={back}>{children}</Page>;
}

export function useBalance() {
  const [b, setB] = useState(null);
  const load = async () => {
    const { data } = await supabase.from('accounts').select('balance,is_demo').eq('currency', 'NGN').eq('status', 'active');
    if (data && data.length) setB(Number((data.find(a => a.is_demo) || data[0]).balance));
  };
  useEffect(() => { load(); }, []);
  return [b, load];
}

export function Receipt({ title, amount, rows, onAgain, again }) {
  return (
    <div className="ot-center">
      <div className="ot-check">✓</div>
      <h2>{title}</h2>
      <div className="ot-big">{ngn(amount)}</div>
      <div className="ot-card" style={{ marginTop: 16 }}>{rows.map(([k, v]) => (v != null && v !== '') && <div className="ot-kv" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      <p className="ot-demo">Demo only. No real money moved.</p>
      <button className="ot-btn" onClick={onAgain}>{again}</button>
      <a className="ot-btn ot-alt" href="#/">Done</a>
    </div>
  );
}
