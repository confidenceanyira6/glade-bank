import React, { useState } from 'react';

// GLADE BANK — UI MOCKUP. All data is local demo data. No backend calls yet.
const RATES = { USD: 1, NGN: 1540.25, EUR: 0.92, GBP: 0.79, CAD: 1.36 };
const TX = [
  ['International Transfer', 'To USA · Sep 12', -500, 'USD', '🌍'],
  ['Salary Credit', 'From Employer · Sep 10', 250000, 'NGN', '💼'],
  ['Bill Payment', 'Sep 08', -12500, 'NGN', '🧾'],
  ['Investment', 'Sep 05', -100000, 'NGN', '📈'],
];
const fmt = (n, c = 'NGN') => (n < 0 ? '-' : '+') + (c === 'NGN' ? '₦' : c + ' ') + Math.abs(n).toLocaleString();
const Demo = () => <div className="demo">DEMO MODE — simulated data, no real money moves</div>;
const Field = ({ label, ...p }) => <label className="field"><span>{label}</span><input {...p} /></label>;
const Sel = ({ label, opts, ...p }) => <label className="field"><span>{label}</span><select {...p}>{opts.map(o => <option key={o}>{o}</option>)}</select></label>;
const Top = ({ t, back, go }) => <div className="top"><button className="back" onClick={() => go(back || 'home')}>←</button><h2>{t}</h2><button className="back" onClick={() => go('notifs')}>🔔</button></div>;

function Welcome({ go }) {
  return <div className="welcome"><b>◆ GLADE BANK</b><h1>Bank Smarter.<br />Live Better.</h1>
    <p>Send money, receive payments, invest and grow — all in one place.</p>
    <button className="btn" onClick={() => go('reg')}>Get Started →</button>
    <p>Already have an account? <a href="#" style={{ color: '#7be0a3' }} onClick={e => { e.preventDefault(); go('home'); }}>Sign in</a></p>
    <p><a href="#" style={{ color: '#9fb4e6' }} onClick={e => { e.preventDefault(); go('admin'); }}>Open Admin Console (mockup)</a></p></div>;
}

function Register({ go }) {
  const [s, setS] = useState(1);
  const next = () => (s < 3 ? setS(s + 1) : go('home'));
  return <><Top t="Create Your Account" back="welcome" go={go} /><div className="pad">
    <div className="steps">{[1, 2, 3].map(i => <div key={i} className={i <= s ? 'on' : ''} />)}</div>
    {s === 1 && <><Field label="First name *" /><Field label="Middle name" /><Field label="Last name *" /><Field label="Email *" type="email" /><Field label="Phone *" /><Field label="Date of birth" type="date" /><Sel label="Gender" opts={['Select', 'Male', 'Female']} /><Sel label="Nationality" opts={['Nigeria', 'Ghana', 'UK', 'USA']} /><Field label="Occupation" /></>}
    {s === 2 && <><Sel label="Country" opts={['Nigeria', 'USA', 'UK']} /><Field label="State/Province" /><Field label="City" /><Field label="Postal code" /><Field label="Residential address" /><b>Next of kin</b><Field label="Full name" /><Field label="Relationship" /></>}
    {s === 3 && <><b>NIN & BVN / ID verification</b><Sel label="ID type" opts={['NIN', 'BVN', 'Passport', "Driver's licence"]} /><Field label="ID number" /><Field label="Upload ID document" type="file" /><Field label="Profile photo" type="file" /></>}
    <button className="btn" onClick={next}>{s < 3 ? 'Next Step →' : 'Continue →'}</button></div></>;
}

function Home({ go }) {
  const [hide, setHide] = useState(false);
  const A = [['➤', 'Send Money', 'transfer'], ['⬇', 'Receive', 'receive'], ['🌍', 'International', 'transfer'], ['⇄', 'Exchange', 'fx']];
  return <><div className="top"><span>Welcome back, Confidence 👋</span><button className="back" onClick={() => go('notifs')}>🔔</button></div><div className="pad">
    <div className="hero"><small>Total Balance (demo)</small><b>{hide ? '••••••' : '₦850,750.25'}</b><small>Available ₦720,600.25 · Acct 0123456789 · Savings · Active</small><br /><button className="tag" onClick={() => setHide(!hide)}>{hide ? 'Show' : 'Hide'}</button></div>
    <div className="actions">{A.map(a => <button key={a[1]} onClick={() => go(a[2])}><div className="ic">{a[0]}</div>{a[1]}</button>)}</div>
    <div className="hero" style={{ background: 'var(--green)' }}><b style={{ fontSize: 18 }}>Grow Your Wealth</b>with Glade Bank Investments<button className="btn alt" onClick={() => go('invest')}>Start Investing →</button></div>
    <div className="card"><b>Monthly spending</b><div className="bars">{[40, 60, 45, 80, 55, 90].map((h, i) => <i key={i} style={{ height: h + '%' }} />)}</div></div>
    <b>Recent Transactions</b> <a href="#" onClick={e => { e.preventDefault(); go('history'); }}>See all</a>
    {TX.slice(0, 3).map(t => <div className="row" key={t[0]}><span>{t[4]}</span><span style={{ flex: 1 }}>{t[0]}<small>{t[1]}</small></span><span className={t[2] < 0 ? 'neg' : 'pos'}>{fmt(t[2], t[3])}</span></div>)}</div></>;
}

function Transfer({ go }) {
  const [s, setS] = useState(1);
  const [f, setF] = useState({ country: 'United States', cur: 'USD', amt: 500, name: '' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const rate = RATES.NGN / RATES[f.cur], fee = 15, get = Math.max(0, f.amt - fee);
  const dyn = { 'United States': ['ABA / Routing number', 'Account number'], 'United Kingdom': ['Sort code', 'Account number'], Germany: ['IBAN', 'SWIFT/BIC'], Canada: ['Institution number', 'Account number'] }[f.country];
  const T = ['Destination', 'Amount', 'Recipient', 'Bank details', 'Confirm'];
  if (s === 6) return <><Top t="Transfer Tracking" go={go} /><div className="pad"><div className="card"><span className="tag w">SIMULATED · Processing</span><h3>{f.amt} USD to {f.name || 'Recipient'}</h3><p>Ref: GB-DEMO-{Math.floor(Math.random() * 90000 + 10000)}</p><p>Draft → Awaiting payment → <b>Processing</b> → Completed</p><small>No real transfer occurred. Demo only.</small></div><button className="btn" onClick={() => go('home')}>Back to Home</button></div></>;
  return <><Top t="International Transfer" go={go} /><div className="pad"><div className="steps">{T.map((_, i) => <div key={i} className={i < s ? 'on' : ''} />)}</div><b>{T[s - 1]}</b>
    {s === 1 && <><Sel label="Country" value={f.country} onChange={set('country')} opts={['United States', 'United Kingdom', 'Germany', 'Canada']} /><Sel label="Currency" value={f.cur} onChange={set('cur')} opts={['USD', 'GBP', 'EUR', 'CAD']} /><Sel label="Method" opts={['Bank Transfer', 'Mobile wallet']} /></>}
    {s === 2 && <><Field label="Amount to send" type="number" value={f.amt} onChange={set('amt')} /><div className="card">Rate (demo) ₦{rate.toFixed(2)}/{f.cur}<br />Fee {fee}<br /><b>Recipient gets {get} {f.cur}</b><br />Delivery 1–3 business days</div></>}
    {s === 3 && <><Field label="Recipient full name" value={f.name} onChange={set('name')} /><Field label="Email" /><Field label="Phone" /><Field label="Address" /><Sel label="Purpose" opts={['Personal expenses', 'Family support', 'Education', 'Business payment', 'Other']} /></>}
    {s === 4 && <><Field label="Bank name" />{dyn.map(d => <Field key={d} label={d} />)}</>}
    {s === 5 && <div className="card">To: {f.name || '—'}<br />Country: {f.country}<br />Send: {f.amt} {f.cur}<br />Fee: {fee}<br />Receives: {get} {f.cur}<br /><span className="tag w">Demo transaction</span></div>}
    <button className="btn" onClick={() => setS(s + 1)}>{s === 5 ? 'Confirm & Submit (demo)' : 'Continue →'}</button>
    {s > 1 && <button className="btn alt" onClick={() => setS(s - 1)}>Back</button>}</div></>;
}

function Fx({ go }) {
  const [a, setA] = useState({ from: 'USD', to: 'EUR', amt: 500 }), [done, setDone] = useState(false);
  const r = RATES[a.to] / RATES[a.from];
  return <><Top t="Currency Exchange" go={go} /><div className="pad"><span className="tag w">Demonstration rates</span>
    <Sel label="From" value={a.from} onChange={e => setA({ ...a, from: e.target.value })} opts={Object.keys(RATES)} /><Sel label="To" value={a.to} onChange={e => setA({ ...a, to: e.target.value })} opts={Object.keys(RATES)} />
    <Field label="Amount" type="number" value={a.amt} onChange={e => setA({ ...a, amt: +e.target.value })} />
    <div className="card">You get <b>{(a.amt * r - 5 * r).toFixed(2)} {a.to}</b><br />Rate: {r.toFixed(4)} · Fee: $5.00</div>
    <button className="btn" onClick={() => setDone(true)}>Exchange Now →</button>{done && <p className="pos">✓ Demo exchange recorded (simulated)</p>}</div></>;
}

function Benef({ go }) {
  const [l, setL] = useState([['John Smith', 'USA ••••8721'], ['Mary Johnson', 'UK ••••1234'], ['Family Support', 'Canada ••••5678']]);
  const [n, setN] = useState('');
  return <><Top t="Beneficiaries" go={go} /><div className="pad"><div className="row"><Field label="Add beneficiary name" value={n} onChange={e => setN(e.target.value)} /><button className="tag" onClick={() => n && (setL([...l, [n, 'New ••••0000']]), setN(''))}>+ Add</button></div>
    {l.map((b, i) => <div className="row" key={i}><span>{b[0]}<small>{b[1]}</small></span><span><button className="tag" onClick={() => go('transfer')}>Send</button> <button className="tag w" onClick={() => setL(l.filter((_, j) => j !== i))}>Delete</button></span></div>)}</div></>;
}

function Invest({ go }) {
  const P = [['Premium Plan', 15, 10000, 12], ['Gold Plan', 20, 50000, 24]];
  const [sel, setSel] = useState(null), [amt, setAmt] = useState(10000), [ok, setOk] = useState(false);
  return <><Top t="Investments" go={go} /><div className="pad"><span className="tag w">All figures simulated · projected ≠ earned</span>
    {P.map(p => <div className="card" key={p[0]}><b>{p[0]}</b><br />{p[1]}% annual return (projected)<br /><small>Min ₦{p[2].toLocaleString()} · {p[3]} months</small><button className="btn" onClick={() => { setSel(p); setOk(false); setAmt(p[2]); }}>Invest Now</button></div>)}
    {sel && <div className="card"><b>{sel[0]}</b><Field label="Amount (₦)" type="number" value={amt} onChange={e => setAmt(+e.target.value)} />Projected: ₦{Math.round(amt * sel[1] / 100).toLocaleString()} / yr<button className="btn" onClick={() => setOk(true)}>Confirm Investment</button>{ok && <p className="pos">✓ Simulated investment active. Withdrawal needs admin approval.</p>}</div>}</div></>;
}

function History({ go }) {
  const [q, setQ] = useState(''), [tab, setTab] = useState('All'), [open, setOpen] = useState(null);
  const rows = TX.filter(t => t[0].toLowerCase().includes(q.toLowerCase()) && (tab === 'All' || (tab === 'Deposits' ? t[2] > 0 : t[2] < 0)));
  return <><Top t="Transaction History" go={go} /><div className="pad"><div className="tabs">{['All', 'Deposits', 'Transfers'].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <Field label="Search" value={q} onChange={e => setQ(e.target.value)} />
    {rows.length === 0 && <p>No transactions found.</p>}{rows.map((t, i) => <div key={i}><div className="row" onClick={() => setOpen(open === i ? null : i)}><span>{t[4]}</span><span style={{ flex: 1 }}>{t[0]}<small>{t[1]}</small></span><span className={t[2] < 0 ? 'neg' : 'pos'}>{fmt(t[2], t[3])}</span></div>{open === i && <div className="card">ID: TX-{1000 + i} · Status: Completed (demo)<br /><button className="tag" onClick={() => alert('Receipt download — backend pending')}>Download receipt</button></div>}</div>)}</div></>;
}

function Receive({ go }) {
  return <><Top t="Receive Money" go={go} /><div className="pad"><span className="tag w">DEMO details — not a real account</span><div className="card">Holder: Confidence Anyira<br />Bank: Glade Bank (demo)<br />Account: 0123456789<br />Currency: NGN</div><button className="btn" onClick={() => navigator.clipboard?.writeText('0123456789')}>Copy details</button></div></>;
}

function Notifs({ go }) {
  const [n, setN] = useState([['✅', 'Transfer Successful', '$500 to USA (demo)', 1], ['📈', 'New Investment', 'Your plan is active', 1], ['🛡', 'Security Alert', 'New login from Lagos, NG', 1], ['🔔', 'Welcome to Glade Bank!', 'Start exploring', 0]]);
  return <><Top t="Notifications" go={go} /><div className="pad">{n.map((x, i) => <div className="row" key={i}><span>{x[0]}</span><span style={{ flex: 1 }}><b>{x[1]}</b><small>{x[2]}</small></span>{x[3] ? <span className="tag">new</span> : null}</div>)}<button className="btn alt" onClick={() => setN(n.map(x => [x[0], x[1], x[2], 0]))}>Mark all as read</button></div></>;
}

function Profile({ go }) {
  const L = ['Personal Information', 'Security Settings', 'Two-Factor Authentication', 'Notification Preferences', 'Currency Preferences', 'Verification Status', 'Help & Support'];
  return <><Top t="Profile & Settings" go={go} /><div className="pad"><div className="card" style={{ textAlign: 'center' }}><div className="ic" style={{ width: 70, height: 70 }}>👤</div><b>Confidence Anyira</b><br /><small>confidence@email.com</small></div>
    {L.map(l => <div className="row" key={l} onClick={() => alert(l + ' — screen to be built')}>{l}<span>›</span></div>)}<button className="btn alt" onClick={() => go('welcome')}>Log Out</button></div></>;
}

function Admin({ go }) {
  const S = ['Dashboard', 'Customers', 'Accounts', 'Transactions', 'Withdrawals', 'Deposits', 'Investments', 'Compliance', 'Staff', 'Audit Logs'];
  const [s, setS] = useState('Dashboard');
  const rows = ['New customer registered · 2m', 'Withdrawal request pending · 5m', 'International transfer completed · 10m', 'Account verification approved · 12m'];
  return <div className="admin"><div className="side"><b>◆ GLADE BANK<br /><small>Admin Console</small></b>{S.map(x => <button key={x} className={s === x ? 'on' : ''} onClick={() => setS(x)}>{x}</button>)}<button onClick={() => go('welcome')}>← Exit</button></div>
    <div className="main"><h2>{s}</h2><div className="demo">DEMO — mock data only</div><br />
      {s === 'Dashboard' ? <><div className="stats">{[['12,540', 'Total Customers'], ['11,890', 'Active Accounts'], ['238', 'Pending Review'], ['₦2.5B', 'Total Transactions']].map(x => <div className="card" key={x[1]}><b>{x[0]}</b>{x[1]}</div>)}</div>
        <div className="card"><b>Transaction Overview</b><div className="bars">{[30, 45, 40, 70, 60, 95].map((h, i) => <i key={i} style={{ height: h + '%' }} />)}</div></div>
        <div className="card"><b>Recent Activities</b>{rows.map(r => <div className="row" key={r}>{r}</div>)}</div></> :
        <div className="card"><table><thead><tr><th>Name</th><th>Detail</th><th>Status</th><th /></tr></thead><tbody>{['Ada Obi', 'John Smith', 'Mary Johnson'].map((n, i) => <tr key={n}><td>{n}</td><td>{s} #{100 + i}</td><td><span className="tag w">Pending</span></td><td><button className="tag" onClick={() => alert('Approve — needs backend permission check')}>Approve</button> <button className="tag w" onClick={() => alert('Reject — reason required (backend)')}>Reject</button></td></tr>)}</tbody></table></div>}</div></div>;
}

const SCREENS = { home: Home, transfer: Transfer, fx: Fx, benef: Benef, invest: Invest, history: History, receive: Receive, notifs: Notifs, profile: Profile, reg: Register };
export default function App() {
  const [v, go] = useState('welcome');
  if (v === 'welcome') return <div className="phone"><Welcome go={go} /></div>;
  if (v === 'admin') return <Admin go={go} />;
  const C = SCREENS[v] || Home;
  const nav = [['home', '🏠', 'Home'], ['transfer', '⇄', 'Transfers'], ['invest', '📈', 'Invest'], ['benef', '👥', 'People'], ['profile', '⚙', 'More']];
  return <div className="phone"><Demo /><C go={go} />{v !== 'reg' && <div className="nav">{nav.map(n => <button key={n[0]} className={v === n[0] ? 'on' : ''} onClick={() => go(n[0])}><i>{n[1]}</i>{n[2]}</button>)}</div>}</div>;
}
