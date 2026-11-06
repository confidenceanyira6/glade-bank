import React, { useEffect, useState } from 'react';
import { supabase } from '../auth/supabase.js';
import { Gate, Receipt, ngn, useBalance } from './ui.jsx';

/* ---------- Airtime, Data, Betting, TV ---------- */
const PROVIDERS = { airtime: ['MTN', 'Airtel', 'Glo', '9mobile'], data: ['MTN', 'Airtel', 'Glo', '9mobile'], betting: ['Bet9ja', 'SportyBet', '1xBet', 'BetKing', 'NairaBet', 'BetWay'], tv: ['DStv', 'GOtv', 'StarTimes'] };
const CFG = {
  airtime: { label: 'Phone number', ph: '08012345678', mode: 'amount', chips: [100, 200, 500, 1000, 2000, 5000], done: 'Airtime sent' },
  data: { label: 'Phone number', ph: '08012345678', mode: 'plan', done: 'Data purchased' },
  betting: { label: 'Betting account ID', ph: 'Your betting user ID', mode: 'amount', chips: [500, 1000, 2000, 5000, 10000], done: 'Betting wallet funded' },
  tv: { label: 'Smartcard / IUC number', ph: '10-digit number', mode: 'plan', done: 'Subscription paid' },
};

function Bill({ cat }) {
  const c = CFG[cat];
  const [prov, setProv] = useState(PROVIDERS[cat][0]);
  const [plans, setPlans] = useState([]);
  const [plan, setPlan] = useState('');
  const [rec, setRec] = useState('');
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [bal, refresh] = useBalance();

  useEffect(() => {
    if (c.mode !== 'plan') return;
    setPlan('');
    supabase.from('bill_plans').select('code,label,amount').eq('category', cat).eq('provider', prov).eq('active', true).order('amount').then(({ data }) => setPlans(data || []));
  }, [cat, prov]);

  const chosen = plans.find(p => p.code === plan);
  const price = c.mode === 'plan' ? (chosen ? Number(chosen.amount) : 0) : Number(amt);
  const pay = async () => {
    setErr('');
    if (!rec.trim()) return setErr(`Enter the ${c.label.toLowerCase()}.`);
    if (c.mode === 'plan' && !chosen) return setErr('Choose a plan.');
    if (!(price > 0)) return setErr('Enter an amount.');
    if (bal !== null && price > bal) return setErr('Insufficient balance.');
    setBusy(true);
    const { data, error } = await supabase.rpc('pay_bill', { p_category: cat, p_provider: prov, p_recipient: rec.trim(), p_plan_code: c.mode === 'plan' ? plan : null, p_amount: c.mode === 'plan' ? null : price });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(data); refresh();
  };

  if (done) {
    return <Receipt title={c.done} amount={done.amount} again="Make another payment" onAgain={() => { setDone(null); setAmt(''); setRec(''); setPlan(''); }}
      rows={[['Provider', done.provider], ['Recipient', done.recipient], ['Plan', done.plan], ['Reference', done.reference], ['New balance', ngn(done.balance)]]} />;
  }
  return (
    <>
      <div className="ot-row" style={{ margin: '0 2px 10px' }}><span className="ot-mut">Choose provider</span><span className="ot-mut">Balance: {bal === null ? '--' : ngn(bal)}</span></div>
      <div className="ot-chips">{PROVIDERS[cat].map(p => <button key={p} style={p === prov ? { background: 'var(--g)', color: '#fff' } : {}} onClick={() => { setProv(p); setErr(''); }}>{p}</button>)}</div>
      <div className="ot-card">
        <label className="ot-lab">{c.label}</label>
        <input className="ot-input" inputMode={cat === 'betting' ? 'text' : 'numeric'} placeholder={c.ph} value={rec} onChange={e => setRec(cat === 'betting' ? e.target.value : e.target.value.replace(/\D/g, ''))} maxLength={cat === 'betting' ? 40 : 11} />
        {c.mode === 'amount' && <>
          <label className="ot-lab">Amount</label>
          <div className="ot-amt"><b>₦</b><input inputMode="decimal" placeholder="0.00" value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          <div className="ot-chips">{c.chips.map(v => <button key={v} onClick={() => setAmt(String(v))}>₦{v.toLocaleString()}</button>)}</div>
        </>}
      </div>
      {c.mode === 'plan' && <>
        <div className="wl-h" style={{ marginTop: 0 }}>Choose a plan</div>
        {plans.map(p => (
          <button key={p.code} type="button" className={'wl-acct' + (p.code === plan ? ' sel' : '')} onClick={() => { setPlan(p.code); setErr(''); }}>
            <div className="wl-top"><div><b>{p.label}</b></div><div className="wl-bal">{ngn(p.amount)}</div></div>
          </button>
        ))}
      </>}
      {err && <p className="ot-err" role="alert">{err}</p>}
      <button className="ot-btn" disabled={busy} onClick={pay}>{busy ? 'Processing...' : price > 0 ? `Pay ${ngn(price)}` : 'Pay'}</button>
      <p className="ot-demo">Demo environment. No real money moves.</p>
    </>
  );
}
export const Airtime = () => <Gate title="Airtime"><Bill cat="airtime" /></Gate>;
export const Data = () => <Gate title="Data"><Bill cat="data" /></Gate>;
export const Betting = () => <Gate title="Betting"><Bill cat="betting" /></Gate>;
export const TV = () => <Gate title="TV Subscription"><Bill cat="tv" /></Gate>;

/* ---------- Fixed deposits ---------- */
const TERMS = [[30, 8], [60, 10], [90, 12], [180, 14], [365, 16]];
const day = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function Fixed() {
  const [list, setList] = useState([]);
  const [amt, setAmt] = useState('');
  const [days, setDays] = useState(90);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [bal, refresh] = useBalance();
  const load = async () => { const { data } = await supabase.from('fixed_deposits').select('*').order('started_at', { ascending: false }); setList(data || []); };
  useEffect(() => { load(); }, []);

  const rate = (TERMS.find(t => t[0] === days) || [0, 0])[1];
  const n = Number(amt);
  const interest = n > 0 ? Math.round(n * rate / 100 * days / 365 * 100) / 100 : 0;
  const create = async () => {
    setErr(''); setMsg('');
    if (!(n >= 1000)) return setErr('Minimum fixed deposit is ₦1,000.');
    if (bal !== null && n > bal) return setErr('Insufficient balance.');
    setBusy(true);
    const { error } = await supabase.rpc('create_fixed_deposit', { p_amount: n, p_days: days });
    setBusy(false);
    if (error) return setErr(error.message);
    setAmt(''); setMsg('Fixed deposit created.'); load(); refresh();
  };
  const close = async d => {
    setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('close_fixed_deposit', { p_id: d.id });
    if (error) return setErr(error.message);
    setMsg(`${ngn(data.paid)} was paid into your NGN account.`); load(); refresh();
  };
  const mature = async d => { await supabase.rpc('demo_mature_fixed_deposit', { p_id: d.id }); load(); };

  return (
    <>
      <div className="ot-card">
        <div className="ot-row"><b>New fixed deposit</b><span className="ot-mut">Balance: {bal === null ? '--' : ngn(bal)}</span></div>
        <label className="ot-lab" style={{ marginTop: 10 }}>Amount</label>
        <div className="ot-amt"><b>₦</b><input inputMode="decimal" placeholder="Minimum 1,000" value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        <label className="ot-lab">Lock period</label>
        <div className="ot-chips">{TERMS.map(([d, r]) => <button key={d} style={d === days ? { background: 'var(--g)', color: '#fff' } : {}} onClick={() => setDays(d)}>{d} days · {r}%</button>)}</div>
        <div className="ot-kv"><span>Interest rate</span><b>{rate}% per year</b></div>
        <div className="ot-kv"><span>Interest earned</span><b>{ngn(interest)}</b></div>
        <div className="ot-kv"><span>You receive at maturity</span><b>{ngn(n + interest)}</b></div>
        {err && <p className="ot-err" role="alert">{err}</p>}
        {msg && <div className="st-toast">{msg}</div>}
        <button className="ot-btn" disabled={busy} onClick={create}>{busy ? 'Creating...' : 'Lock funds'}</button>
      </div>
      <div className="wl-h">My fixed deposits</div>
      {list.length === 0 && <div className="ot-card"><p className="ot-mut" style={{ margin: 0 }}>No fixed deposits yet.</p></div>}
      {list.map(d => {
        const ready = new Date(d.matures_at) <= new Date();
        return (
          <div className="wl-acct" key={d.id}>
            <div className="wl-top"><div><b>{ngn(d.principal)}</b><small>{d.rate_pa}% p.a. · {d.term_days} days</small></div><span className={'st-tag' + (d.status === 'active' ? '' : ' warn')} style={{ marginLeft: 'auto' }}>{d.status === 'active' ? (ready ? 'Matured' : 'Active') : d.status === 'paid_out' ? 'Paid out' : 'Broken'}</span></div>
            <div className="ot-kv"><span>Interest</span><b>{ngn(d.interest)}</b></div>
            <div className="ot-kv"><span>{d.status === 'active' ? 'Matures' : 'Closed'}</span><b>{day(d.status === 'active' ? d.matures_at : d.closed_at)}</b></div>
            {d.status === 'active' && <div className="wl-acts">
              <button className="fill" onClick={() => close(d)}>{ready ? 'Withdraw with interest' : 'Break early (no interest)'}</button>
              {!ready && <button onClick={() => mature(d)}>Demo: skip to maturity</button>}
            </div>}
          </div>
        );
      })}
    </>
  );
}
export const FixedPage = () => <Gate title="Fixed Deposit"><Fixed /></Gate>;

/* ---------- Loan Center ---------- */
function Loans() {
  const [ver, setVer] = useState(undefined);
  const [list, setList] = useState([]);
  const [amt, setAmt] = useState('');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [bal, refresh] = useBalance();
  const load = async () => {
    const { data: s } = await supabase.auth.getSession();
    const { data: v } = await supabase.from('customer_verifications').select('status').eq('user_id', s.session.user.id).maybeSingle();
    setVer(v ? v.status : 'not_started');
    const { data } = await supabase.from('loans').select('*').order('created_at', { ascending: false });
    setList(data || []);
  };
  useEffect(() => { load(); }, []);

  const active = list.find(l => l.status === 'active');
  const n = Number(amt);
  const interest = n > 0 ? Math.round(n * 0.04 * days / 30 * 100) / 100 : 0;
  const apply = async () => {
    setErr(''); setMsg('');
    if (!(n >= 1000 && n <= 100000)) return setErr('Borrow between ₦1,000 and ₦100,000.');
    setBusy(true);
    const { error } = await supabase.rpc('apply_loan', { p_amount: n, p_days: days });
    setBusy(false);
    if (error) return setErr(error.message);
    setAmt(''); setMsg(`${ngn(n)} was paid into your NGN account.`); load(); refresh();
  };
  const repay = async l => {
    setErr(''); setMsg('');
    const { data, error } = await supabase.rpc('repay_loan', { p_id: l.id });
    if (error) return setErr(error.message);
    setMsg(`Loan repaid (${ngn(data.paid)}).`); load(); refresh();
  };

  if (ver === undefined) return <p className="ot-mut">Loading...</p>;
  return (
    <>
      <div className="ot-card ot-center" style={{ padding: 20 }}>
        <small className="ot-mut">You can borrow up to</small>
        <div className="ot-big">{ngn(100000)}</div>
        <p className="ot-mut" style={{ margin: '4px 0 0' }}>4% interest per 30 days. Demo terms.</p>
      </div>
      {msg && <div className="st-toast">{msg}</div>}
      {err && <p className="ot-err" role="alert">{err}</p>}

      {active && (
        <div className="wl-acct">
          <div className="wl-top"><div><b>Active loan</b><small>Due {day(active.due_at)}</small></div><span className="st-tag warn" style={{ marginLeft: 'auto' }}>Active</span></div>
          <div className="ot-kv"><span>Borrowed</span><b>{ngn(active.principal)}</b></div>
          <div className="ot-kv"><span>Interest</span><b>{ngn(active.interest)}</b></div>
          <div className="ot-kv"><span>Total to repay</span><b>{ngn(active.total_due)}</b></div>
          <button className="ot-btn" onClick={() => repay(active)}>Repay {ngn(active.total_due)}</button>
        </div>
      )}

      {!active && ver !== 'verified' && (
        <div className="ot-card"><b>Verify your identity first</b><p className="ot-mut">Loans unlock once your verification is complete.</p><a className="ot-btn" href="#/kyc">Verify now</a></div>
      )}

      {!active && ver === 'verified' && (
        <div className="ot-card">
          <b>Apply for a loan</b>
          <label className="ot-lab" style={{ marginTop: 10 }}>Amount</label>
          <div className="ot-amt"><b>₦</b><input inputMode="decimal" placeholder="1,000 - 100,000" value={amt} onChange={e => setAmt(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          <div className="ot-chips">{[5000, 10000, 20000, 50000, 100000].map(v => <button key={v} onClick={() => setAmt(String(v))}>₦{v.toLocaleString()}</button>)}</div>
          <label className="ot-lab">Repay within</label>
          <div className="ot-chips">{[14, 30, 60].map(d => <button key={d} style={d === days ? { background: 'var(--g)', color: '#fff' } : {}} onClick={() => setDays(d)}>{d} days</button>)}</div>
          <div className="ot-kv"><span>Interest</span><b>{ngn(interest)}</b></div>
          <div className="ot-kv"><span>Total to repay</span><b>{ngn(n + interest)}</b></div>
          <button className="ot-btn" disabled={busy} onClick={apply}>{busy ? 'Applying...' : 'Get loan'}</button>
        </div>
      )}

      {list.filter(l => l.status === 'repaid').length > 0 && <>
        <div className="wl-h">Past loans</div>
        {list.filter(l => l.status === 'repaid').map(l => <div className="ot-card" key={l.id}><div className="ot-kv"><span>{day(l.created_at)}</span><b>{ngn(l.principal)} · Repaid</b></div></div>)}
      </>}
      <p className="ot-demo">Balance: {bal === null ? '--' : ngn(bal)}</p>
    </>
  );
}
export const LoanPage = () => <Gate title="Loan Center"><Loans /></Gate>;

/* ---------- Invitation ---------- */
function Invite() {
  const [r, setR] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const load = async () => { const { data } = await supabase.rpc('my_referral'); setR(data); };
  useEffect(() => { load(); }, []);

  const share = async () => {
    const text = `Join Glade Bank with my invitation code ${r.code} and get ₦500.`;
    if (navigator.share) { try { await navigator.share({ title: 'Glade Bank', text, url: location.origin }); return; } catch (e) { /* cancelled */ } }
    navigator.clipboard && navigator.clipboard.writeText(text + ' ' + location.origin);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };
  const redeem = async () => {
    setErr(''); setMsg('');
    if (code.trim().length < 4) return setErr('Enter an invitation code.');
    setBusy(true);
    const { data, error } = await supabase.rpc('redeem_referral', { p_code: code });
    setBusy(false);
    if (error) return setErr(error.message);
    setCode(''); setMsg(`${ngn(data.reward)} was added to your NGN account.`); load();
  };
  if (!r) return <p className="ot-mut">Loading...</p>;
  return (
    <>
      <div className="ot-card ot-center" style={{ padding: 22 }}>
        <small className="ot-mut">Invite friends. You both get ₦500.</small>
        <div className="ot-big" style={{ letterSpacing: 4, margin: '8px 0' }}>{r.code}</div>
        <button className="ot-btn" onClick={share}>{copied ? 'Copied' : 'Share invitation'}</button>
      </div>
      <div className="ot-card">
        <div className="ot-kv"><span>Friends invited</span><b>{r.count}</b></div>
        <div className="ot-kv"><span>Rewards earned</span><b>{ngn(r.earned)}</b></div>
      </div>
      {!r.used && (
        <div className="ot-card">
          <b>Have an invitation code?</b>
          <input className="ot-input" style={{ marginTop: 10 }} placeholder="Enter code" value={code} maxLength={12} onChange={e => setCode(e.target.value.toUpperCase())} />
          <button className="ot-btn ot-alt" disabled={busy} onClick={redeem}>{busy ? 'Checking...' : 'Redeem ₦500'}</button>
        </div>
      )}
      {msg && <div className="st-toast">{msg}</div>}
      {err && <p className="ot-err" role="alert">{err}</p>}
    </>
  );
}
export const InvitePage = () => <Gate title="Invitation"><Invite /></Gate>;

/* ---------- More / All services ---------- */
const SECTIONS = [
  ['Pay and top up', [['📱', 'Airtime', '#/airtime'], ['📶', 'Data', '#/data'], ['⚽', 'Betting', '#/betting'], ['📺', 'TV', '#/tv'], ['💡', 'Electricity', '#/bills']]],
  ['Save and borrow', [['🔒', 'Fixed', '#/fixed'], ['💰', 'Loan Center', '#/loans'], ['📣', 'Invitation', '#/invite'], ['📈', 'Invest', 'invest']]],
  ['Send and receive', [['🏦', 'To bank', '#/local'], ['🔁', 'Move money', '#/move'], ['🌍', 'International', 'transfer'], ['📥', 'Receive', '#/accounts'], ['💱', 'Exchange', '#/exchange'], ['👥', 'Beneficiaries', 'benef']]],
  ['Manage', [['🏧', 'My accounts', '#/accounts'], ['💳', 'Cards', '#/cards'], ['🧾', 'Statements', '#/statements'], ['📊', 'Limits', '#/limits'], ['📜', 'History', 'history']]],
  ['Account and help', [['✅', 'Verification', '#/kyc'], ['🛡️', 'Security', '#/security'], ['🔔', 'Alerts', '#/notify'], ['💬', 'Support', '#/support']]],
];
const open = t => () => { if (t.startsWith('#')) { location.hash = t; } else { sessionStorage.setItem('gb', t); location.hash = '#/'; } };

export function More() {
  return (
    <div className="ot"><div className="ot-wrap">
      <div className="ot-head"><button onClick={() => { location.hash = '#/'; }} aria-label="Back">←</button><h2>All Services</h2><span /></div>
      {SECTIONS.map(([h, items]) => (
        <div key={h} className="ot-card">
          <div className="st-h" style={{ margin: '0 0 14px' }}>{h}</div>
          <div className="st-grid">{items.map(([ic, t, to]) => <button key={t} onClick={open(to)}><i>{ic}</i>{t}</button>)}</div>
        </div>
      ))}
    </div></div>
  );
}
