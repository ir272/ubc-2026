import { createRoot } from 'react-dom/client';
import { applyTheme } from './themes';
import './styles.css';
import './fx.css';
import { App } from './App';

// After a redeploy, a page that was already open may ask for a code file the new deployment no longer has
// (the bet code is loaded only when first needed). Reload once to pick up the new build instead of failing.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  try {
    const last = Number(sessionStorage.getItem('gb.reloadedAt') || 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('gb.reloadedAt', String(Date.now()));
  } catch {
    /* storage blocked: still reload */
  }
  location.reload();
});

applyTheme();
createRoot(document.getElementById('root')!).render(<App />);
