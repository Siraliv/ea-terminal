import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initTheme } from '@/store/theme';

// Apply the persisted theme to <html data-theme> synchronously, before
// React renders. Skips the jarring black flash a light-theme user would
// otherwise see while the store hydrated.
initTheme();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
