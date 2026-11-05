/* Entry point: styles, then start the app once every module is loaded. */
import './styles/app.css';
import { boot } from './app.js';
import { RT, setUI } from './lib/runtime.js';
import { go } from './lib/router.js';
import { Act } from './lib/act.js';

// Console / test handle (the old single-script build exposed these as globals).
window.__mg = { RT, go, setUI, Act };

boot();
