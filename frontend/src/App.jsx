import React, { useState } from 'react';

// GLADE BANK — UI MOCKUP. Local demo data only. No backend calls.
const R = { USD: 1, NGN: 1540.25, EUR: 0.92, GBP: 0.79, CAD: 1.36 };
const FLAG = { 'United States': '🇺🇸', 'United Kingdom': '🇬🇧', Canada: '🇨🇦', Germany: '🇩🇪', Nigeria: '🇳🇬', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', CAD: '🇨🇦', NGN: '🇳🇬' };
const TX = [['International Transfer', 'To USA · Sep 12, 2025 · 10:24 AM', -500, 'USD', '🇺🇸', 'T'], ['Salary Credit', 'From Employer · Sep 10, 2025', 250000, 'NGN', '💼', 'D'], ['Bill Payment', 'Sep 08, 2025 · 06:20 PM', -12500, 'NGN', '🧾', 'T'], ['Investment', 'Sep 05, 2025 · 11:10 AM', -100000, 'NGN', '📈', 'T']];
const money = (n, c) => (n < 0 ? '-' : '+') + (c === 'NGN' ? '₦' : '$') + Math.abs(n).toLocaleString();
const hub = () => { location.hash = '#/hub'; };

const Logo = ({ sub }) => <div className="logo"><svg width="34" height="34" viewBox="0 0 40 40"><circle cx="20" cy="20" r="19" fill="#0f7a3d" /><text x="20" y="28" textAnchor="middle" fontSize="24" fontWeight="800" fill="#fff">G</text></svg><span>GLADE BANK{sub && <small>{sub}</small>}</span></div>;
const Fld = ({ l, ic, opts, ...p }) => <label className="field"><span>{l}</span><div className="inp">{ic && <i>{ic}</i>}{opts ? <select {...p}>{opts.map(o => <option key={o}>{o}</option>)}</select> : <input {...p} />}</div></label>;
const Steps = ({ n, t }) => <div className="steps">{Array.from({ length: t }, (_, i) => <React.Fragment key={i}>{i > 0 && <div className={'l ' + (i < n ? 'on' : '')} />}<div className={'s ' + (i < n ? 'on' : '')}>{i + 1}</div></React.Fragment>)}</div>;
const Top = ({ t, go, to = 'home', bell = true }) => <div className="top"><button className="back" onClick={() => go(to)}>←</button><h2>{t}</h2>{bell ? <button className="back" onClick={() => go('notifs')}>🔔</button> : <span />}</div>;
const Banner = () => <div className="demo">DEMO MODE — simulated data, no real money moves</div>;

function Welcome({ go }) {
  return <div className="welcome"><div className="top" style={{ padding: 0 }}><Logo /><span>☰</span></div><h1>Bank Smarter.<br />Live Better.</h1><p style={{ opacity: .85 }}>Send money, receive payments, invest and grow — all in one place.</p>
    <button className="btn" onClick={() => go('reg')}>Get Started →</button><p>Already have an account? <a href="#/login" style={{ color: '#7be0a3' }}>Sign in</a></p>
    <div className="badges"><div><i>🛡</i>Licensed & Regulated</div><div><i>🔒</i>256-bit Encryption</div><div><i>🌍</i>Global Coverage</div></div>
    <a href="#" style={{ color: '#9fb4e6', textAlign: 'center', marginTop: 16, fontSize: 12 }} onClick={e => { e.preventDefault(); go('admin'); }}>Open Admin Console (mockup)</a></div>;
}

function Register({ go }) {
  const [s, setS] = useState(1);
  const L = ['Personal', 'Address', 'Verify'];
  return <><Top t="Create Your Account" go={go} to="welcome" bell={false} /><div className="pad"><p style={{ textAlign: 'center', color: 'var(--mut)', margin: 0 }}>Join Glade Bank today</p><Steps n={s} t={3} /><p style={{ textAlign: 'center', fontSize: 12, margin: '-8px 0 8px' }}>{L[s - 1]}</p>
    {s === 1 && <><b>Personal Information</b><Fld l="First Name *" ic="👤" /><Fld l="Middle Name" ic="👤" /><Fld l="Last Name *" ic="👤" /><Fld l="Email Address *" ic="✉" type="email" /><Fld l="Phone Number *" ic="📞" /><Fld l="Date of Birth" ic="📅" type="date" /><Fld l="Gender" ic="⚥" opts={['Select Gender', 'Male', 'Female']} /><Fld l="Nationality" ic="🇳🇬" opts={['Nigeria', 'Ghana', 'UK', 'USA']} /><Fld l="Occupation" ic="💼" opts={['Select Occupation', 'Employed', 'Self-employed', 'Student']} /></>}
    {s === 2 && <><b>Address</b><Fld l="Country" opts={['Nigeria', 'USA', 'UK']} /><Fld l="State / Province" /><Fld l="City" /><Fld l="Postal code" /><Fld l="Residential address" /><b>Next of kin</b><Fld l="Full name" /><Fld l="Email" /><Fld l="Phone" /><Fld l="Relationship" /></>}
    {s === 3 && <><div style={{ textAlign: 'center' }}><div style={{ fontSize: 44 }}>🛡</div><b style={{ fontSize: 20 }}>NIN & BVN Enrollment</b><p style={{ color: 'var(--mut)' }}>Complete your identity verification</p></div>
      <button className="opt"><span style={{ fontSize: 30 }}>🪪</span><span><b>NIN</b><small>National Identification Number — Link your NIN</small></span></button><button className="opt"><span style={{ fontSize: 30 }}>🖐</span><span><b>BVN</b><small>Bank Verification Number — Link your BVN</small></span></button>
      <p style={{ textAlign: 'center', color: 'var(--mut)' }}>Or upload your documents</p><label className="up"><div style={{ fontSize: 26 }}>☁</div>Upload ID Document<br /><small>(JPG, PNG, PDF)</small><input type="file" hidden /></label><Fld l="Profile photograph" type="file" /><small style={{ color: 'var(--mut)' }}>🔒 Your information is secure and protected</small></>}
    <button className="btn" onClick={() => (s < 3 ? setS(s + 1) : go('home'))}>{s < 3 ? 'Next Step →' : 'Continue →'}</button>{s > 1 && <button className="btn alt" onClick={() => setS(s - 1)}>Back</button>}</div></>;
}

function Home({ go }) {
  const [hide, setHide] = useState(false);
  const A = [['➤', 'Send Money', 'local'], ['⬇', 'Receive', 'receive'], ['◎', 'International Transfer', 'transfer'], ['+', 'More', 'hub']];
  return <><div className="top"><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Logo /><span style={{ fontSize: 13 }}>Welcome back,<br /><b>Confidence 👋</b></span></div><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="back bell" data-n="3" onClick={() => go('notifs')}>🔔</button><div className="av">👤</div></div></div><div className="pad">
    <div className="bal"><span className="pill">↑ +12.5%</span><small>Total Balance (demo)</small><b>{hide ? '•••••••' : '₦850,750.25'}</b><small>Available Balance</small><div style={{ fontSize: 20, fontWeight: 700 }}>{hide ? '•••••' : '₦720,600.25'}</div><small>Acct 0123456789 · Savings · Active</small><button className="eye" onClick={() => setHide(!hide)}>{hide ? '🙈' : '👁'}</button></div>
    <div className="actions">{A.map(a => <button key={a[1]} onClick={() => (a[2] === 'hub' ? hub() : a[2] === 'local' ? (location.hash = '#/local') : go(a[2]))}><div className="ic">{a[0]}</div>{a[1]}</button>)}</div>
    <div className="promo"><div><b style={{ fontSize: 18 }}>Grow Your Wealth</b><br /><small>with Glade Bank Investments</small><br /><button className="btn sm" style={{ marginTop: 10 }} onClick={() => go('invest')}>Start Investing →</button></div><span>🪙🌱</span></div>
    <div className="row" style={{ border: 0 }}><b className="g">Recent Transactions</b><a href="#" onClick={e => { e.preventDefault(); go('history'); }}>See All →</a></div>
    {TX.slice(0, 3).map(t => <div className="row" key={t[0]}><div className="av">{t[4]}</div><span className="g">{t[0]}<small>{t[1]}</small></span><span className={t[2] < 0 ? 'neg' : 'pos'}>{money(t[2], t[3])}</span></div>)}</div></>;
}

function Transfer({ go }) {
  const [s, setS] = useState(1), [f, setF] = useState({ country: 'United States', cur: 'USD', amt: 500, name: '' });
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const fee = 15, rate = R.NGN / R[f.cur], get = Math.max(0, f.amt - fee);
  const dyn = { 'United States': ['ABA / Routing number', 'Account number'], 'United Kingdom': ['Sort code', 'Account number'], Germany: ['IBAN', 'SWIFT/BIC'], Canada: ['Institution number', 'Account number'] }[f.country];
  if (s === 5) return <><Top t="Transfer Tracking" go={go} /><div className="pad"><div className="card"><span className="tag w">SIMULATED · Processing</span><h3>{f.amt} {f.cur} to {f.name || 'Recipient'}</h3><p>Ref: GB-DEMO-48213</p><p>Draft → Awaiting payment → <b>Processing</b> → Completed</p><small>No real transfer occurred. Demonstration only.</small></div><button className="btn" onClick={() => go('home')}>Back to Home</button></div></>;
  return <><Top t="International Transfer" go={go} /><div className="pad"><Steps n={s} t={4} />
    {s === 1 && <><h3 style={{ margin: '0 0 4px', color: 'var(--navy)' }}>Transfer Details</h3><Fld l="Country" ic={FLAG[f.country]} value={f.country} onChange={set('country')} opts={['United States', 'United Kingdom', 'Germany', 'Canada']} /><Fld l="Currency" ic={FLAG[f.cur]} value={f.cur} onChange={set('cur')} opts={['USD', 'GBP', 'EUR', 'CAD']} /><Fld l="Transfer Method" ic="🏦" opts={['Bank Transfer', 'Mobile wallet']} /><Fld l="Amount to send" type="number" value={f.amt} onChange={set('amt')} />
      <div className="card"><div className="kv"><span>Exchange Rate (demo)</span><b>₦{rate.toFixed(2)} / {f.cur}</b></div><div className="kv"><span>Transfer Fee</span><b>{fee.toFixed(2)}</b></div><div className="kv"><span>You Receive</span><b>{get} {f.cur}</b></div><div className="kv"><span>Estimated Delivery</span><b>1-3 Business Days</b></div></div></>}
    {s === 2 && <><h3>Recipient</h3><Fld l="Full name" value={f.name} onChange={set('name')} /><Fld l="Email" /><Fld l="Phone" /><Fld l="Address" /><Fld l="Purpose" opts={['Personal expenses', 'Family support', 'Education', 'Business payment', 'Other']} /></>}
    {s === 3 && <><h3>Bank Details</h3><Fld l="Bank name" />{dyn.map(d => <Fld key={d} l={d} />)}</>}
    {s === 4 && <><h3>Confirm</h3><div className="card"><div className="kv"><span>To</span><b>{f.name || '—'}</b></div><div className="kv"><span>Country</span><b>{FLAG[f.country]} {f.country}</b></div><div className="kv"><span>Send</span><b>{f.amt} {f.cur}</b></div><div className="kv"><span>Fee</span><b>{fee}</b></div><div className="kv"><span>Recipient gets</span><b>{get} {f.cur}</b></div><span className="tag w">Demo transaction</span></div></>}
    <button className="btn" onClick={() => setS(s + 1)}>{s === 4 ? 'Confirm & Submit (demo)' : 'Continue →'}</button>{s > 1 && <button className="btn alt" onClick={() => setS(s - 1)}>Back</button>}</div></>;
}

function Benef({ go }) {
  const [tab, setTab] = useState('Saved Recipients'), [l, setL] = useState([['John Smith', 'USA · ••••8721', '🇺🇸'], ['Mary Johnson', 'UK · ••••1234', '🇬🇧'], ['Family Support', 'Canada · ••••5678', '🇨🇦']]), [n, setN] = useState('');
  return <><Top t="Beneficiaries" go={go} bell={false} /><div className="pad"><div className="tabs">{['Saved Recipients', 'Recent'].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div>
    <div style={{ display: 'flex', gap: 8 }}><div style={{ flex: 1 }}><Fld l="Add new beneficiary" value={n} onChange={e => setN(e.target.value)} /></div><button className="btn sm" style={{ alignSelf: 'flex-end', marginBottom: 10 }} onClick={() => { if (n) { setL([...l, [n, 'New · ••••0000', '🌐']]); setN(''); } }}>+ Add</button></div>
    {(tab === 'Recent' ? l.slice(0, 1) : l).map((b, i) => <div className="row" key={b[0] + i}><div className="av">{b[2]}</div><span className="g">{b[0]}<small>{b[1]}</small></span><button className="tag" onClick={() => go('transfer')}>Send</button><button className="tag w" onClick={() => setL(l.filter(x => x !== b))}>Delete</button></div>)}</div></>;
}

function Invest({ go }) {
  const P = [['Premium Plan', 15, 10000, 12], ['Gold Plan', 20, 50000, 24]], [sel, setSel] = useState(null), [amt, setAmt] = useState(0), [ok, setOk] = useState(false);
  return <><Top t="Investments" go={go} /><div className="pad"><div className="promo"><div><small>Glade Investments</small><br /><b style={{ fontSize: 20 }}>Grow Your Wealth with Glade Bank</b><br /><small>Up to 15% Annual Return (projected)</small></div><span>🪙</span></div><span className="tag w">All figures simulated · projected ≠ earned</span>
    <div className="row" style={{ border: 0 }}><b className="g">Investment Plans</b><a href="#">View All →</a></div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{P.map(p => <div className="card" key={p[0]}><b>{p[0]}</b><br />{p[1]}% Annual Return<br /><small>Min: ₦{p[2].toLocaleString()}<br />Duration: {p[3]} Months</small><button className="btn sm" style={{ marginTop: 8, width: '100%' }} onClick={() => { setSel(p); setAmt(p[2]); setOk(false); }}>Invest Now</button></div>)}</div>
    {sel && <div className="card"><b>{sel[0]}</b><Fld l="Amount (₦)" type="number" value={amt} onChange={e => setAmt(+e.target.value)} />Projected: ₦{Math.round(amt * sel[1] / 100).toLocaleString()} / yr<button className="btn" onClick={() => setOk(true)}>Confirm Investment</button>{ok && <p className="pos">✓ Simulated investment active. Withdrawal needs admin approval.</p>}</div>}</div></>;
}

function History({ go }) {
  const [q, setQ] = useState(''), [tab, setTab] = useState('All'), [open, setOpen] = useState(null);
  const rows = TX.filter(t => t[0].toLowerCase().includes(q.toLowerCase()) && (tab === 'All' || (tab === 'Deposits' ? t[2] > 0 : t[2] < 0)));
  return <><Top t="Transaction History" go={go} /><div className="pad"><div className="tabs">{['All', 'Transfers', 'Deposits', 'More'].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}</div><Fld l="" ic="🔍" placeholder="Search transactions..." value={q} onChange={e => setQ(e.target.value)} />
    {rows.length === 0 && <p>No transactions found.</p>}{rows.map((t, i) => <div key={t[0]}><div className="row" onClick={() => setOpen(open === i ? null : i)}><div className="av">{t[4]}</div><span className="g">{t[0]}<small>{t[1]}</small></span><span className={t[2] < 0 ? 'neg' : 'pos'}>{money(t[2], t[3])}</span></div>{open === i && <div className="card">ID: TX-{1000 + i} · Status: Completed (demo)<br /><button className="tag" onClick={() => alert('Receipt download needs the backend')}>Download receipt</button></div>}</div>)}</div></>;
}

function Fx({ go }) {
  const [a, setA] = useState({ from: 'USD', to: 'EUR', amt: 500 }), [done, setDone] = useState(false), r = R[a.to] / R[a.from];
  return <><Top t="Currency Exchange" go={go} bell={false} /><div className="pad"><span className="tag w">Demonstration rates</span><Fld l="From" ic={FLAG[a.from]} value={a.from} onChange={e => setA({ ...a, from: e.target.value })} opts={Object.keys(R)} /><Fld l="To" ic={FLAG[a.to]} value={a.to} onChange={e => setA({ ...a, to: e.target.value })} opts={Object.keys(R)} /><Fld l="Amount" type="number" value={a.amt} onChange={e => setA({ ...a, amt: +e.target.value })} />
    <div style={{ display: 'flex', gap: 8 }}>{[100, 500, 1000].map(v => <button key={v} className="tag" style={{ flex: 1, padding: 9 }} onClick={() => setA({ ...a, amt: v })}>${v}</button>)}</div>
    <div className="card" style={{ marginTop: 12 }}><small>You Get</small><div style={{ fontSize: 28, fontWeight: 800, color: 'var(--navy)' }}>{Math.max(0, (a.amt - 5) * r).toFixed(2)} {a.to}</div><small>Rate: {r.toFixed(4)} · Fee: $5.00</small></div><button className="btn" onClick={() => setDone(true)}>Exchange Now →</button>{done && <p className="pos">✓ Demo exchange recorded (simulated)</p>}</div></>;
}

function Receive({ go }) {
  return <><Top t="Receive Money" go={go} /><div className="pad"><span className="tag w">DEMO details — not a real account</span><div className="card" style={{ marginTop: 10 }}><div className="kv"><span>Holder</span><b>Confidence Anyira</b></div><div className="kv"><span>Bank</span><b>Glade Bank (demo)</b></div><div className="kv"><span>Account</span><b>0123456789</b></div><div className="kv"><span>Currency</span><b>NGN</b></div></div><button className="btn" onClick={() => navigator.clipboard?.writeText('0123456789')}>Copy details</button><button className="btn alt">Share</button></div></>;
}

function Notifs({ go }) {
  const [tab, setTab] = useState('All'), [n, setN] = useState([['✅', 'Transfer Successful', 'Your $500.00 transfer to USA was successful (demo). · 2m ago', 1], ['📈', 'New Investment', 'Your investment plan is active. · 1h ago', 1], ['🛡', 'Security Alert', 'New login from Lagos, NG. · 2h ago', 1], ['🔔', 'Welcome to Glade Bank!', 'Start exploring your account. · 1d ago', 0]]);
  const un = n.filter(x => x[3]).length;
  return <><Top t="Notifications" go={go} bell={false} /><div className="pad"><div className="tabs">{['All', 'Unread (' + un + ')'].map(t => <button key={t} className={tab === t.split(' ')[0] ? 'on' : ''} onClick={() => setTab(t.split(' ')[0])}>{t}</button>)}</div>
    {n.filter(x => tab === 'All' || x[3]).map((x, i) => <div className="row" key={i}><div className="av">{x[0]}</div><span className="g"><b>{x[1]}</b><small>{x[2]}</small></span>{x[3] ? <span className="tag">new</span> : null}</div>)}<button className="btn alt" onClick={() => setN(n.map(x => [x[0], x[1], x[2], 0]))}>Mark all as read</button></div></>;
}

function Profile({ go }) {
  const L = [['👤', 'Personal Information', ''], ['🛡', 'Security Settings', '#/security'], ['🔐', 'Two-Factor Authentication', '#/security', 'Enabled'], ['🔔', 'Notification Preferences', ''], ['💱', 'Currency Preferences', ''], ['✅', 'Verification Status', '#/verify', 'Verified'], ['💬', 'Help & Support', '#/support']];
  return <><Top t="Profile & Settings" go={go} bell={false} /><div className="pad"><div style={{ textAlign: 'center', margin: '8px 0 14px' }}><div className="av" style={{ width: 84, height: 84, fontSize: 44, margin: '0 auto 8px' }}>👤</div><b>Confidence Anyira</b><br /><small style={{ color: 'var(--mut)' }}>confidence@email.com</small></div>
    {L.map(l => <div className="menu" key={l[1]} onClick={() => (l[2] ? (location.hash = l[2]) : alert(l[1] + ' — screen not built yet'))}><span>{l[0]}</span><span className="g">{l[1]}</span>{l[3] && <span className="tag">{l[3]}</span>}<span>›</span></div>)}<button className="btn alt" style={{ color: 'var(--red)' }} onClick={() => go('welcome')}>Log Out</button></div></>;
}

function Admin({ go }) {
  const S = ['Dashboard', 'Customers', 'Accounts', 'Transactions', 'Withdrawals', 'Deposits', 'Investments', 'Compliance', 'Staff', 'Audit Logs', 'Settings'], [s, setS] = useState('Dashboard');
  const pts = [20, 28, 22, 40, 36, 55, 48, 70, 62, 85], path = pts.map((p, i) => (i ? 'L' : 'M') + i * 40 + ',' + (100 - p)).join(' ');
  const rows = ['New customer registered · 2m ago', 'Withdrawal request pending · 5m ago', 'International transfer completed · 10m ago', 'Account verification approved · 12m ago'];
  return <div className="admin"><div className="side"><Logo sub="Admin Console" />{S.map(x => <button key={x} className={s === x ? 'on' : ''} onClick={() => setS(x)}>{x}</button>)}<button onClick={() => go('welcome')}>← Exit</button></div>
    <div className="main"><div className="mtop"><h2>{s === 'Dashboard' ? 'Admin Dashboard' : s}</h2><span>Admin 👤</span></div><div className="demo" style={{ marginBottom: 12 }}>DEMO — mock data only</div>
      {s === 'Dashboard' ? <><div className="stats">{[['👥', '12,540', 'Total Customers'], ['🛡', '11,890', 'Active Accounts'], ['⏳', '238', 'Pending Review'], ['💰', '₦2.5B', 'Total Transactions']].map(x => <div className="card" key={x[2]}><div className="av">{x[0]}</div><div><b>{x[1]}</b><small>{x[2]}</small></div></div>)}</div>
        <div className="two"><div className="card"><b>Recent Activities</b>{rows.map(r => <div className="row" key={r}>• {r}</div>)}</div><div className="card"><b>Transaction Overview</b><svg viewBox="0 0 360 110" width="100%"><path d={path + ' L360,110 L0,110 Z'} fill="#14a04f22" /><path d={path} stroke="#14a04f" strokeWidth="3" fill="none" /></svg><small>Jan Feb Mar Apr May Jun</small></div></div>
        <div className="card qa"><b>Quick Actions</b><br /><br />{[['Manage Customers', 'Customers'], ['Review Withdrawals', 'Withdrawals'], ['View Transactions', 'Transactions'], ['View Audit Logs', 'Audit Logs']].map(q => <button key={q[0]} onClick={() => setS(q[1])}>{q[0]}</button>)}</div></> :
        <div className="card"><table><thead><tr><th>Name</th><th>Reference</th><th>Status</th><th>Action</th></tr></thead><tbody>{['Ada Obi', 'John Smith', 'Mary Johnson'].map((n, i) => <tr key={n}><td>{n}</td><td>{s} #{100 + i}</td><td><span className="tag w">Pending</span></td><td><button className="tag" onClick={() => alert('Approve — needs backend permission check')}>Approve</button> <button className="tag w" onClick={() => alert('Reject — reason required (backend)')}>Reject</button></td></tr>)}</tbody></table></div>}
      <p><a href="#/adjust">Balance adjustment tool</a> · <a href="#/audit">Audit log page</a></p></div></div>;
}

const SCREENS = { home: Home, transfer: Transfer, fx: Fx, benef: Benef, invest: Invest, history: History, receive: Receive, notifs: Notifs, profile: Profile, reg: Register };
export default function App() {
  const [v, go] = useState(() => (sessionStorage.getItem('gb') || 'welcome'));
  const nav = (x) => { sessionStorage.setItem('gb', x === 'welcome' || x === 'admin' || x === 'reg' ? 'welcome' : x); go(x); };
  if (v === 'welcome') return <div className="phone"><Welcome go={nav} /></div>;
  if (v === 'admin') return <Admin go={nav} />;
  const C = SCREENS[v] || Home;
  const N = [['home', '🏠', 'Home'], ['transfer', '⇄', 'Transfers'], ['invest', '📈', 'Investments'], ['more', '⋯', 'More']];
  return <div className="phone"><Banner /><C go={nav} />{v !== 'reg' && <div className="nav">{N.map(n => <button key={n[0]} className={v === n[0] ? 'on' : ''} onClick={() => (n[0] === 'more' ? (location.hash = '#/hub') : nav(n[0]))}><i>{n[1]}</i>{n[2]}</button>)}</div>}</div>;
}
