/* Hash router: #/floor, #/dash, #/display/<line>, #/reports, #/admin/<tab>, #/how */
import { RT, bump, setUI } from './runtime.js';

RT.route = { page: 'floor', sub: null };
export function parseHash() { const [page, sub] = (location.hash.replace(/^#\/?/, '') || 'floor').split('/'); return { page: page || 'floor', sub: sub || null }; }
export function go(page, sub) { const h = `#/${page}${sub ? '/' + sub : ''}`; if (location.hash !== h) location.hash = h; else { RT.route = parseHash(); bump(); } }
window.addEventListener('hashchange', () => { RT.route = parseHash(); setUI({ dialog: null, drawer: null, menu: false }); });
