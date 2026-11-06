/* ════════════════════════════════════════════════════════════════════════
   HMI v2 — React (UMD) + htm. Reads engine state every render; every control
   calls an engine action. Scene and simulation share one rAF loop.
   ════════════════════════════════════════════════════════════════════════ */
import React from 'react';
import htm from 'htm';
import { MGE } from '@mg/engine';
import { Scene3D } from '@mg/scene';


export const { useState, useEffect, useRef, useReducer } = React;
export const html = htm.bind(React.createElement);
export const M = MGE;
export const { POS, STATIONS, WORK_POS, AREAS, fmtClock, fmtDur, shortVin, dispId } = M;

/* ── runtime ── */
export const RT = {
  S: null, speed: 5, running: true, acc: 0, scenario: 1, rev: 0,
  ui: { selection: null, hover: null, drawer: null, dialog: null, simOpen: false, legend: false, view2D: false, panelWidth: 0, muted: false, logFilter: 'all', xray: false, xraySel: true, view: 'overview', theme: 'auto', stripLane: 'FINAL' },
  listeners: new Set(),
};
export function setUI(patch) { Object.assign(RT.ui, patch); RT.rev++; RT.listeners.forEach((f) => f()); }
export function bump() { RT.rev++; RT.listeners.forEach((f) => f()); }
export const act = (fn) => (...a) => { fn(...a); bump(); };

/* ── theme: auto follows the host / OS; the toggle pins light or dark ── */
export const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } } };
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let hostTheme = document.documentElement.getAttribute('data-theme');
export function effectiveTheme() {
  if (RT.ui.theme === 'dark' || RT.ui.theme === 'light') return RT.ui.theme;
  if (hostTheme === 'dark' || hostTheme === 'light') return hostTheme;
  return mq && mq.matches ? 'dark' : 'light';
}
function applyTheme() {
  const root = document.documentElement;
  if (RT.ui.theme === 'auto') { if (hostTheme) root.setAttribute('data-theme', hostTheme); else root.removeAttribute('data-theme'); }
  else root.setAttribute('data-theme', RT.ui.theme);
  if (Scene3D.ok) Scene3D.setTheme(effectiveTheme());
}
export function cycleTheme() { const order = ['auto', 'light', 'dark']; const t = order[(order.indexOf(RT.ui.theme) + 1) % 3]; store.set('mg-theme', t); setUI({ theme: t }); applyTheme(); }
/* "Large touch targets" (per device, for gloved hands on floor tablets): controls grow to 56 px. */
export const largeTouch = () => document.documentElement.dataset.touch === 'large';
export function setLargeTouch(on) { store.set('mg-touch', on ? 'large' : ''); if (on) document.documentElement.dataset.touch = 'large'; else delete document.documentElement.dataset.touch; bump(); }
if (store.get('mg-touch') === 'large') document.documentElement.dataset.touch = 'large';
if (mq) mq.addEventListener('change', () => { if (RT.ui.theme === 'auto') applyTheme(); bump(); });
new MutationObserver(() => { const a = document.documentElement.getAttribute('data-theme'); if (RT.ui.theme === 'auto' && a !== hostTheme) { hostTheme = a; if (Scene3D.ok) Scene3D.setTheme(effectiveTheme()); bump(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

