import React, { useEffect, useState } from 'react';
import CardVisual from './CardVisual.jsx';
import MBNav, { goBase } from '../mybank/MBNav.jsx';
import { Icon } from '../mybank/icons.jsx';
import { detectBrand, luhn, isExpired, listMyCards, registerCard, removeCard, fmtDate, fmtTime } from './cardsService.js';

const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const YEARS = Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() + i));

function AddCard({ onDone }) {
  const [name, setName] = useState('Confidence Anyira');
  const [num, setNum] = useState('');
  const [mm, setMm] = useState('');
  const [yy, setYy] = useState('');
  const [cvv, setCvv] = useState('');
  const [err, setErr] = useState('');
  const digits = num.replace(/\D/g, '');
  const brand = detectBrand(digits);

  const submit = async (e) => {
    e.preventDefault();
    const holder = name.trim().replace(/\s+/g, ' ');
    if (!/^[A-Za-z][A-Za-z .'-]{1,39}$/.test(holder)) return setErr('Enter the cardholder name as printed on the card.');
    if (!brand) return setErr('We support Visa and Mastercard cards.');
    if (digits.length !== 16 || !luhn(digits)) return setErr('Enter a valid 16-digit card number.');
    if (!mm || !yy) return setErr('Select the expiry month and year.');
    if (isExpired(mm, yy)) return setErr('This card has expired.');
    if (!/^\d{3}$/.test(cvv)) return setErr('Enter the 3-digit CVV.');
    // Only masked, non-sensitive fields leave this component. Number and CVV are discarded below.
    const res = await registerCard({ holder, brand, last4: digits.slice(-4), expMonth: mm, expYear: yy });
    setNum(''); setCvv('');
    if (!res.ok) return setErr(res.error);
    onDone();
  };

  return (
    <form onSubmit={submit} autoComplete="off" noValidate>
      <CardVisual brand={brand} holder={name.trim()} digits={digits} expMonth={mm} expYear={yy} />
      <label className="field"><span>Cardholder name</span><div className="inp"><input value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} maxLength={40} autoComplete="cc-name" placeholder="Name as printed on card" /></div></label>
      <label className="field"><span>Card number {brand && <b className="cv-bb">{brand}</b>}</span><div className="inp"><input value={num} onChange={(e) => { setNum(e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim()); setErr(''); }} inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" /></div></label>
      <div className="two-f">
        <label className="field"><span>Expiry month</span><div className="inp"><select value={mm} onChange={(e) => { setMm(e.target.value); setErr(''); }}><option value="">MM</option>{MONTHS.map((m) => <option key={m}>{m}</option>)}</select></div></label>
        <label className="field"><span>Expiry year</span><div className="inp"><select value={yy} onChange={(e) => { setYy(e.target.value); setErr(''); }}><option value="">YYYY</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></div></label>
      </div>
      <label className="field"><span>CVV</span><div className="inp"><input type="password" value={cvv} onChange={(e) => { setCvv(e.target.value.replace(/\D/g, '').slice(0, 3)); setErr(''); }} inputMode="numeric" autoComplete="cc-csc" maxLength={3} placeholder="•••" /></div></label>
      <div className="cv-note"><Icon n="check" s={16} /><div>Prototype: use test cards only (Visa 4242 4242 4242 4242, Mastercard 5555 5555 5555 4444). The full number and CVV are never saved; only the last 4 digits are kept.</div></div>
      <div className="cv-err" role="alert">{err}</div>
      <button className="btn" type="submit">Save Card</button>
      <button className="btn alt" type="button" onClick={onDone}>Cancel</button>
    </form>
  );
}

export default function CustomerCards() {
  const [cards, setCards] = useState([]);
  const [mode, setMode] = useState('list');
  const [open, setOpen] = useState(null);
  const refresh = () => listMyCards().then(setCards);
  useEffect(() => { refresh(); }, [mode]);
  const sel = cards.find((c) => c.id === open);

  return (
    <>
      <div className="top"><button className="back" onClick={() => (mode === 'list' && !sel ? goBase('home') : (setMode('list'), setOpen(null)))} aria-label="Back"><Icon n="back" s={20} /></button><h2>{mode === 'add' ? 'Add Card' : sel ? 'Card Details' : 'My Cards'}</h2><span /></div>
      <div className="pad">
        {mode === 'add' ? <AddCard onDone={() => setMode('list')} /> : sel ? (
          <>
            <CardVisual brand={sel.brand} holder={sel.holder} last4={sel.last4} expMonth={sel.expMonth} expYear={sel.expYear} />
            {[['Card holder', sel.holder], ['Card type', sel.brand], ['Card number', sel.cardNumber], ['Expiry date', `${sel.expMonth}/${String(sel.expYear).slice(2)}`], ['Added', `${fmtDate(sel.date, sel.time)} · ${fmtTime(sel.date, sel.time)}`], ['Status', sel.status]].map(([l, v]) => <div className="cv-row2" key={l}><div className="g"><small>{l}</small><b>{v}</b></div></div>)}
            <button className="btn alt" style={{ color: 'var(--red)' }} onClick={async () => { if (confirm('Remove this card?')) { await removeCard(sel.id); setOpen(null); refresh(); } }}>Remove Card</button>
          </>
        ) : (
          <>
            <p style={{ color: 'var(--mut)', fontSize: 13, marginTop: 0 }}>Your saved cards. Only the last 4 digits are kept.</p>
            {cards.length === 0 && <div className="card" style={{ textAlign: 'center', color: 'var(--mut)' }}><Icon n="card" s={32} /><p>No cards yet. Add your first card.</p></div>}
            {cards.map((c) => <CardVisual key={c.id} brand={c.brand} holder={c.holder} last4={c.last4} expMonth={c.expMonth} expYear={c.expYear} onClick={() => setOpen(c.id)} />)}
            <button className="btn" onClick={() => setMode('add')}>+ Add Card</button>
          </>
        )}
      </div>
      <MBNav active="cards" />
    </>
  );
}
