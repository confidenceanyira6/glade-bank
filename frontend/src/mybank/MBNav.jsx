import React from 'react';
import { Icon } from './icons.jsx';
import './mybank.css';

// App.jsx keeps its current screen in sessionStorage('gb'); hash pages (#/cards, #/accounts) jump back to it like this.
export const goBase = (screen) => {
  try { sessionStorage.setItem('gb', screen); } catch { /* ignore */ }
  location.hash = '#/';
};

const ITEMS = [['home', 'home', 'Home'], ['cards', 'card', 'Cards'], ['history', 'swap', 'Transactions'], ['profile', 'user', 'Profile']];

/** Bottom navigation for hash pages. `active` is one of home | cards | history | profile. */
export default function MBNav({ active }) {
  const open = (k) => (k === 'cards' ? (location.hash = '#/cards') : goBase(k));
  return (
    <div className="nav">
      {ITEMS.map(([k, ic, label]) => (
        <button key={k} className={active === k ? 'on' : ''} onClick={() => open(k)}><Icon n={ic} s={21} /><span>{label}</span></button>
      ))}
    </div>
  );
}
