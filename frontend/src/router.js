import { useEffect, useState } from 'react';

// Tiny hash router so the app works on any static host (GitHub Pages, etc).
const read = () => window.location.hash.replace(/^#/, '') || '/';
let navs = 0;

export function usePath() {
  const [p, setP] = useState(read);
  useEffect(() => {
    const h = () => setP(read());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return p;
}

export function go(path) {
  if (read() === path) return;
  navs += 1;
  window.location.hash = path;
}

export function replace(path) {
  window.location.replace(window.location.pathname + window.location.search + '#' + path);
}

export function back(fallback = '/home') {
  if (navs > 0) {
    navs -= 1;
    window.history.back();
  } else {
    go(fallback);
  }
}
