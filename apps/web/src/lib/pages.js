/* The app's pages, in navigation order: used by the page rail (tablet and desktop) and by the
   phone menu. Each page shows only to roles that may open it. */
import { adminAllowed } from '../admin.js';
import { can } from '../auth.js';
import { go } from './router.js';
import { RT } from './runtime.js';

const NAV = [
  ['floor', 'Floor', 'layers', () => true],
  ['dash', 'Dashboard', 'grid', () => true],
  ['display', 'Displays', 'tv', () => true],
  ['reports', 'Reports', 'chart', () => can('reports')],
  ['admin', 'Settings', 'cog', () => adminAllowed()],
  ['how', 'Guide', 'book', () => true],
];

/** Pages this user may open: { value, label, icon }. */
export const navPages = () => NAV.filter((p) => p[3]()).map(([value, label, icon]) => ({ value, label, icon }));

const APP_NAME = 'MG GA Operations', LINES = { trim: 'Trim Line', chassis: 'Chassis Line', final: 'Final Line' };
/** Browser tab title for the current route, so tabs and history entries can be told apart. */
export function pageTitle(override) {
  const { page, sub } = RT.route, nav = NAV.find((p) => p[0] === page);
  const name = override || (page === 'display' ? `${LINES[sub] || 'Line'} display` : nav ? nav[1] : 'Page not found');
  return `${name} · ${APP_NAME}`;
}

/** Open a page (a line display opens on the line last shown, Chassis by default). */
export function goPage(k) {
  const cur = RT.route.page;
  go(k, k === 'display' ? (RT.route.sub && cur === 'display' ? RT.route.sub : 'chassis') : null);
}
