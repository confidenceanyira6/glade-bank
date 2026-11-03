import React, { useEffect, useState } from 'react';
import Base from './App.jsx';
import { PAGES, HUB } from './Extra.jsx';

// Hash routing: '#/name' opens an extra page, anything else shows the original app.
const get = () => (location.hash.startsWith('#/') ? location.hash.slice(2) : '');
export default function AppPlus() {
  const [r, setR] = useState(get());
  useEffect(() => { const f = () => setR(get()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  const P = PAGES[r];
  if (P) return <div className="phone" style={{ paddingBottom: 24 }}><div className="demo">DEMO MODE — simulated, no real money moves</div><P /></div>;
  return <><Base />{!r && <a href="#/hub" className="fab">☰ Services</a>}</>;
}
export { HUB };
