/* Entry point: styles, then start the app once every module is loaded. */
import './styles/index.css';
import { boot } from './app.js';
import { RT, setUI } from './lib/runtime.js';
import { go } from './lib/router.js';
import { Act } from './lib/act.js';

// Console and test handle, in development and the demo/test build only: never in the production bundle (audit S1).
if (import.meta.env.MODE !== 'production') window.__mg = { RT, go, setUI, Act };

boot();
