/* Entry point: styles, then start the app once every module is loaded. */
// fonts are bundled, so the app looks the same on an isolated plant network or opened offline (audit D6)
import '@fontsource/barlow/latin-300.css';
import '@fontsource/barlow/latin-400.css';
import '@fontsource/barlow/latin-500.css';
import '@fontsource/barlow/latin-600.css';
import '@fontsource/barlow/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import './styles/index.css';
import { boot } from './app.js';
import { RT, setUI } from './lib/runtime.js';
import { go } from './lib/router.js';
import { Act } from './lib/act.js';

// Console and test handle, in development and the demo/test build only: never in the production bundle (audit S1).
if (import.meta.env.MODE !== 'production') window.__mg = { RT, go, setUI, Act };

boot();
