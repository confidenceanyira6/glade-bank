import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppPlus.jsx';
import './styles.css';
import './theme-opay.css';

// After a new deploy, an already-open tab may ask for a file that no longer exists. Reload once to get the new version.
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('gb_reloaded')) { sessionStorage.setItem('gb_reloaded', '1'); location.reload(); }
});
setTimeout(() => sessionStorage.removeItem('gb_reloaded'), 10000);

createRoot(document.getElementById('root')).render(<App />);
