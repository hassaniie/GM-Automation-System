/* ── utilities ─────────────────────────────────────────────────────────── */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export const pad2 = (n) => String(n).padStart(2, '0');
export function fmtClock(t, secs = true) {
  let s = Math.floor(t); s = ((s % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return secs ? `${pad2(h)}:${pad2(m)}:${pad2(ss)}` : `${pad2(h)}:${pad2(m)}`;
}
export function fmtDur(sec) {
  const neg = sec < 0; let s = Math.floor(Math.abs(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const body = h > 0 ? `${h}:${pad2(m)}:${pad2(ss)}` : `${pad2(m)}:${pad2(ss)}`;
  return (neg ? '−' : '') + body;
}
export const shortVin = (vin) => (vin ? '…' + vin.slice(-6) : '—');
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
