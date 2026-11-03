import React from 'react';
import './cards.css';

const CLS = { VISA: 'visa', Mastercard: 'mc' };

export const BrandMark = ({ brand }) =>
  brand === 'VISA' ? <span className="cv-visa">VISA</span>
    : brand === 'Mastercard' ? <span className="cv-mc"><i /><i /></span>
      : <span className="cv-none" />;

// Live typing: digits are masked, only the last group (positions 13-16) is shown as typed.
// Stored cards: pass last4 and the first three groups are masked.
function groupsFor({ digits, last4 }) {
  if (last4) return [['••••'], ['••••'], ['••••'], [last4]].map((g) => g.map((c) => ({ c })));
  const out = [];
  for (let g = 0; g < 4; g++) {
    const cells = [];
    for (let k = 0; k < 4; k++) {
      const i = g * 4 + k;
      if (i >= digits.length) cells.push({ c: '•', dim: true });
      else cells.push({ c: i >= 12 ? digits[i] : '•' });
    }
    out.push(cells);
  }
  return out;
}

/** Realistic bank card. Props: brand, holder, digits (live) or last4 (stored), expMonth, expYear, onClick */
export default function CardVisual({ brand, holder, digits = '', last4, expMonth, expYear, onClick }) {
  const exp = `${expMonth || 'MM'}/${expYear ? String(expYear).slice(2) : 'YY'}`;
  return (
    <div className={`cv ${CLS[brand] || 'none'} ${onClick ? 'click' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined} aria-label="Bank card">
      <div className="cv-row" style={{ alignItems: 'center' }}><span className="cv-bank">GLADE BANK</span><span style={{ fontSize: 12, opacity: .8 }}>DEBIT</span></div>
      <div className="cv-chip" />
      <div className="cv-num" aria-label="Masked card number">
        {groupsFor({ digits, last4 }).map((g, i) => <span key={i}>{g.map((x, j) => <span key={j} className={x.dim ? 'dim' : ''}>{x.c}</span>)}</span>)}
      </div>
      <div className="cv-row cv-bot">
        <div><small>CARD HOLDER</small><b>{holder || 'Your name'}</b></div>
        <div><small>EXPIRES</small><b>{exp}</b></div>
        <BrandMark brand={brand} />
      </div>
    </div>
  );
}
