import React from 'react';
import ReactDOM from 'react-dom/client';
// Tabler is bundled rather than loaded from a CDN: the app is used from field offices on
// unreliable connections, and a third-party CDN is one more thing that has to be reachable
// for the UI to render at all. The JS half is Bootstrap's — the navbar collapse and the
// dropdowns in Navbar/LanguageSwitcher are driven by `data-bs-toggle` and need it.
import '@tabler/core/dist/css/tabler.min.css';
import '@tabler/core/dist/js/tabler.min.js';
import './utils/axiosConfig'; // Configure axios interceptors first
import App from './App';
import './index.css';
// The Peskas logo's colours (synced from peskas-context/brand).
import './components/common/peskas-logo.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
); 