import React, { useEffect, useState } from 'react';
import CardVisual from './CardVisual.jsx';
import { listAdminCards, setCardStatus, fmtDate, fmtTime } from './cardsService.js';
import './cards.css';

const Status = ({ s }) => <span className={'tag' + (s === 'Active' ? '' : s === 'Blocked' ? ' bad' : ' w')}>{s}</span>;

/** Admin > Card Management. Shows masked numbers only; there is no CVV or full number anywhere in the data. */
export default function AdminCards() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [brand, setBrand] = useState('All');
  const [status, setStatus] = useState('All');
  const [openId, setOpenId] = useState(null);
  const refresh = () => listAdminCards().then(setRows);
  useEffect(() => { refresh(); }, []);

  const count = (s) => rows.filter((r) => r.status === s).length;
  const needle = q.trim().toLowerCase();
  const list = rows.filter((r) => (brand === 'All' || r.brand === brand) && (status === 'All' || r.status === status) && (!needle || `${r.holder} ${r.email} ${r.id} ${r.last4}`.toLowerCase().includes(needle)));
  const sel = rows.find((r) => r.id === openId);

  const toggle = async (r) => {
    const to = r.status === 'Blocked' ? 'Active' : 'Blocked';
    if (!confirm(`${to === 'Blocked' ? 'Block' : 'Unblock'} card ${r.id}?`)) return;
    await setCardStatus(r.id, to);
    refresh();
  };

  return (
    <>
      <div className="stats">{[['Total cards', rows.length], ['Active', count('Active')], ['Blocked', count('Blocked')], ['Expired', count('Expired')]].map(([l, v]) => <div className="card" key={l}><div><b>{v}</b><small>{l}</small></div></div>)}</div>
      <div className="card">
        <div className="cv-note" style={{ marginTop: 0 }}>Prototype data. Only masked numbers are shown. CVVs and full card numbers are never stored or displayed.</div>
        <div className="ac-bar">
          <input placeholder="Search name, email, record ID or last 4..." value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>{['All', 'VISA', 'Mastercard'].map((o) => <option key={o}>{o}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>{['All', 'Active', 'Blocked', 'Expired'].map((o) => <option key={o}>{o}</option>)}</select>
        </div>
        {list.length === 0 ? <p style={{ textAlign: 'center', color: 'var(--mut)' }}>No card records match your search.</p> : (
          <>
            <div className="ac-table" style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Record</th><th>Cardholder</th><th>Card number</th><th>Brand</th><th>Registered</th><th>Status</th><th /></tr></thead>
                <tbody>{list.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td><b>{r.holder}</b><br /><small style={{ color: 'var(--mut)' }}>{r.email}</small></td>
                    <td>{r.cardNumber}</td><td>{r.brand}</td>
                    <td>{fmtDate(r.date, r.time)}<br /><small style={{ color: 'var(--mut)' }}>{fmtTime(r.date, r.time)}</small></td>
                    <td><Status s={r.status} /></td>
                    <td><button className="tag" onClick={() => setOpenId(r.id)}>View</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="ac-list">{list.map((r) => (
              <div className="ac-item" key={r.id} onClick={() => setOpenId(r.id)}>
                <div className="t"><b>{r.holder}</b><Status s={r.status} /></div>
                <div>{r.cardNumber}</div>
                <small>{r.brand} · {fmtDate(r.date, r.time)} {fmtTime(r.date, r.time)}</small>
              </div>
            ))}</div>
          </>
        )}
      </div>

      {sel && (
        <div className="ac-ov" onClick={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <div className="ac-dlg" role="dialog" aria-modal="true" aria-label="Card record">
            <div className="ac-dh"><b>Card record · {sel.id}</b><button className="back" onClick={() => setOpenId(null)} aria-label="Close">✕</button></div>
            <CardVisual brand={sel.brand} holder={sel.holder} last4={sel.last4} expMonth={sel.expMonth} expYear={sel.expYear} />
            <div className="ac-det">
              {[['Cardholder', sel.holder], ['Customer', sel.email], ['Brand', sel.brand], ['Card number', sel.cardNumber], ['Expiry', `${sel.expMonth}/${String(sel.expYear).slice(2)}`], ['Registered date', fmtDate(sel.date, sel.time)], ['Registered time', fmtTime(sel.date, sel.time)]].map(([l, v]) => <div key={l}><small>{l}</small>{v}</div>)}
              <div><small>Status</small><Status s={sel.status} /></div>
            </div>
            <p style={{ color: 'var(--mut)', fontSize: 12 }}>CVV and the full card number are never stored or displayed.</p>
            <div className="ac-act">
              {sel.status !== 'Expired' && <button className="btn" style={sel.status === 'Blocked' ? undefined : { background: 'var(--red)', boxShadow: 'none' }} onClick={() => toggle(sel)}>{sel.status === 'Blocked' ? 'Unblock card' : 'Block card'}</button>}
              <button className="btn alt" onClick={() => setOpenId(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
