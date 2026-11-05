/* ════════════════════════════════════════════════════════════════════════
   Sign-in, users and roles (URD req 30).
   PROTOTYPE: accounts, password hashes and sessions live in this browser.
   A deployment signs in against the plant directory (SSO) with server-side
   sessions; the screens and permission rules stay the same.
   ════════════════════════════════════════════════════════════════════════ */
import { BV_FULL, BV_FULL_INK } from '@mg/scene/brand';
import { go } from './lib/router.js';
import { M, RT, bump, fmtClock, html, setUI, store, useEffect, useReducer, useRef, useState } from './lib/runtime.js';
import { Icon, MgMark, tv } from './lib/ui-kit.js';

export { ROLES } from '@mg/contracts';
import { ROLES } from '@mg/contracts';
// Demo accounts (fictional people). Shown on the sign-in screen.
const DEMO_USERS = [
  { id: 'u1', name: 'Hamza Siddiqui', empId: 'MG-1001', email: 'hamza.siddiqui@mgjw.pk', role: 'admin', pw: 'Admin@2026' },
  { id: 'u2', name: 'Ayesha Malik', empId: 'MG-2040', email: 'ayesha.malik@mgjw.pk', role: 'authorised', pw: 'Plan@2026' },
  { id: 'u3', name: 'Usman Tariq', empId: 'MG-3112', email: 'usman.tariq@mgjw.pk', role: 'supervisor', pw: 'Line@2026' },
  { id: 'u4', name: 'Bilal Ahmed', empId: 'MG-4207', email: 'bilal.ahmed@mgjw.pk', role: 'maintenance', pw: 'Fix@2026' },
  { id: 'u5', name: 'Head Office', empId: 'MG-9001', email: 'ho.viewer@mgjw.pk', role: 'viewer', pw: 'View@2026' },
];
const IDLE_LOCK_MS = 15 * 60 * 1000, MAX_TRIES = 5, LOCKOUT_MS = 30 * 1000;
const sstore = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* unavailable */ } }, del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* unavailable */ } } };
export const jget = (k, d) => { try { const v = store.get(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
export const jset = (k, v) => store.set(k, JSON.stringify(v));

export async function hashPw(salt, pw) {
  const txt = `mg-andon:${salt}:${pw}`;
  try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join(''); }
  catch (e) { let h = 5381; for (let i = 0; i < txt.length; i++) h = ((h << 5) + h + txt.charCodeAt(i)) | 0; return 'f' + (h >>> 0).toString(16); } // no SubtleCrypto (file://): weaker fallback
}
export const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export const Auth = {
  user: null, locked: false, lastActive: Date.now(), log: jget('mg-andon-authlog', []),
  async init() {
    let users = jget('mg-andon-users', null);
    if (!users) { users = await Promise.all(DEMO_USERS.map(async (u) => ({ id: u.id, name: u.name, empId: u.empId, email: u.email, role: u.role, active: true, hash: await hashPw(u.id, u.pw), created: Date.now(), lastIn: null }))); jset('mg-andon-users', users); }
    this.users = users;
    const sess = JSON.parse(sstore.get('mg-andon-session') || store.get('mg-andon-session') || 'null');
    if (sess && sess.exp > Date.now()) { const u = users.find((x) => x.id === sess.uid && x.active); if (u) this.user = u; }
    ['pointerdown', 'keydown', 'wheel'].forEach((ev) => window.addEventListener(ev, () => { this.lastActive = Date.now(); }, { capture: true, passive: true }));
    setInterval(() => { if (this.user && !this.locked && !isKiosk() && Date.now() - this.lastActive > IDLE_LOCK_MS) { this.locked = true; this.record('Screen locked after inactivity', this.user.name); bump(); } }, 10000);
  },
  saveUsers() { jset('mg-andon-users', this.users); },
  record(action, who, detail = '') { this.log.push({ at: Date.now(), action, who, detail }); if (this.log.length > 400) this.log.shift(); jset('mg-andon-authlog', this.log); },
  find(idOrEmail) { const q = (idOrEmail || '').trim().toLowerCase(); return this.users.find((u) => u.empId.toLowerCase() === q || u.email.toLowerCase() === q) || null; },
  tries() { return jget('mg-andon-tries', { n: 0, until: 0 }); },
  async signIn(idOrEmail, pw, keep) {
    const t = this.tries();
    if (t.until > Date.now()) return { ok: false, reason: `Too many attempts. Try again in ${Math.ceil((t.until - Date.now()) / 1000)} s.`, locked: true };
    const u = this.find(idOrEmail);
    const good = u && u.active && (await hashPw(u.id, pw)) === u.hash;
    if (!good) {
      const n = t.n + 1, until = n >= MAX_TRIES ? Date.now() + LOCKOUT_MS : 0;
      jset('mg-andon-tries', { n: until ? 0 : n, until });
      this.record('Sign-in failed', idOrEmail || '(blank)', u && !u.active ? 'account disabled' : '');
      if (u && !u.active) return { ok: false, reason: 'This account is disabled. Ask your administrator.' };
      return { ok: false, reason: until ? `Too many attempts. Sign-in is paused for ${LOCKOUT_MS / 1000} s.` : `That ID and password don't match.${n >= 3 ? ` ${MAX_TRIES - n} tries left.` : ''}`, locked: !!until };
    }
    jset('mg-andon-tries', { n: 0, until: 0 });
    this.start(u, keep, 'Signed in');
    return { ok: true };
  },
  start(u, keep, how) {
    this.user = u; this.locked = false; this.lastActive = Date.now(); u.lastIn = Date.now(); this.saveUsers();
    const sess = JSON.stringify({ uid: u.id, exp: Date.now() + (keep ? 12 * 3600e3 : 10 * 3600e3) });
    store.set('mg-andon-session', keep ? sess : ''); sstore.set('mg-andon-session', sess);
    this.record(how, u.name, ROLES[u.role].label);
  },
  async unlock(pw) { const u = this.user; if (u && (await hashPw(u.id, pw)) === u.hash) { this.locked = false; this.lastActive = Date.now(); this.record('Screen unlocked', u.name); return true; } this.record('Unlock failed', u ? u.name : '?'); return false; },
  signOut() { if (this.user) this.record('Signed out', this.user.name); this.user = null; this.locked = false; store.set('mg-andon-session', ''); sstore.del('mg-andon-session'); setUI({ dialog: null, drawer: null, selection: null, menu: false }); location.hash = '#/'; bump(); },
  switchTo(u) { this.record('Demo user switch', u.name, `from ${this.user ? this.user.name : '—'}`); this.start(u, !!store.get('mg-andon-session'), 'Signed in (demo switch)'); setUI({ menu: false, dialog: null }); bump(); },
};
export function can(perm) { const u = Auth.user; if (!u || Auth.locked) return false; const P = ROLES[u.role].perms; return P.includes('*') || P.includes(perm); }
export function userName() { const u = Auth.user; return u ? `${u.name} · ${ROLES[u.role].short}` : 'System'; }
const isKiosk = () => RT.route && RT.route.page === 'display';

/* ── sign-in screen ── */
export function SignIn({ lock }) {
  const S = RT.S, p = M.pace(S), open = S.calls.filter((c) => c.clearedT == null).length, ls = M.lineStatus(S);
  const [id, setId] = useState(lock && Auth.user ? Auth.user.empId : ''), [pw, setPw] = useState(''), [show, setShow] = useState(false), [keep, setKeep] = useState(true), [caps, setCaps] = useState(false);
  const [busy, setBusy] = useState(false), [err, setErr] = useState(null), [touched, setTouched] = useState(false), [demo, setDemo] = useState(!lock), pwRef = useRef(null), idRef = useRef(null);
  const [, tick] = useReducer((x) => x + 1, 0);
  useEffect(() => { (lock ? pwRef : idRef).current && (lock ? pwRef : idRef).current.focus(); const i = setInterval(tick, 1000); return () => clearInterval(i); }, []);
  const t = Auth.tries(), waitS = t.until > Date.now() ? Math.ceil((t.until - Date.now()) / 1000) : 0;
  const idErr = touched && !lock && !id.trim() ? 'Enter your employee ID or email.' : null, pwErr = touched && !pw ? 'Enter your password.' : null;
  const submit = async (e) => {
    e && e.preventDefault(); setTouched(true); setErr(null);
    if ((!lock && !id.trim()) || !pw || waitS) return;
    setBusy(true);
    await new Promise((r) => setTimeout(r, 450));
    if (lock) { const okU = await Auth.unlock(pw); setBusy(false); if (!okU) { setErr('Wrong password.'); setPw(''); } else bump(); return; }
    const r = await Auth.signIn(id, pw, keep); setBusy(false);
    if (!r.ok) { setErr(r.reason); setPw(''); pwRef.current && pwRef.current.focus(); return; }
    const home = ROLES[Auth.user.role].home; if (!location.hash || location.hash === '#/' || location.hash === '#') go(home); else bump();
  };
  const fill = (u) => { setId(u.empId); setPw(u.pw); setErr(null); setTouched(false); pwRef.current && pwRef.current.focus(); };
  const keyCaps = (e) => setCaps(!!(e.getModifierState && e.getModifierState('CapsLock')));
  return html`<div class="signin">
    <section class="si-brand" aria-hidden=${lock ? 'true' : 'false'}>
      <div class="si-top"><${MgMark} /><div><div class="brand-name">GA Operations</div><div class="brand-sub">MG JW Automobile · General Assembly</div></div></div>
      <div class="si-hero"><div class="micro">Andon · Trim → Chassis → Final</div><h1>Every station, every call, in real time.</h1>
        <p>Cycle time against takt, buzzers, supervisor and maintenance calls, targets and downtime, on the floor, at each line and at head office.</p></div>
      <${SignInFlow} />
      <div class="si-live" role="status"><span class="sim-tag"><${Icon} n="flask" size=${10} />SIMULATION</span>
        <div><span class="micro">Line</span><b style=${{ color: tv(ls.tone) }}>${ls.label}</b></div>
        <div><span class="micro">Final · this shift</span><b class="mono">${p.done} / ${p.target}</b></div>
        <div><span class="micro">Open calls</span><b class="mono">${open}</b></div>
        <div><span class="micro">Shop time</span><b class="mono">${fmtClock(S.t, false)}</b></div></div>
      <div class="si-foot"><img class="full" src=${BV_FULL} alt="Bolt & Volt" /><img class="ink" src=${BV_FULL_INK} alt="Bolt & Volt" /><span>Designed and built by Bolt & Volt</span></div>
    </section>
    <section class="si-form-wrap">
      <form class="si-form" onSubmit=${submit} noValidate aria-labelledby="si-h">
        ${lock ? html`<div class="si-avatar">${initials(Auth.user.name)}</div>` : null}
        <h2 id="si-h">${lock ? 'Screen locked' : 'Sign in'}</h2>
        <p class="si-sub">${lock ? html`Locked after ${IDLE_LOCK_MS / 60000} minutes without use. Enter the password for <b>${Auth.user.name}</b> to continue.` : 'Use your MG JW employee ID or work email.'}</p>
        ${err ? html`<div class="si-err" role="alert"><${Icon} n="alert" />${err}</div>` : null}
        ${waitS ? html`<div class="si-err" role="alert"><${Icon} n="lock" />Sign-in paused after ${MAX_TRIES} failed attempts. Try again in ${waitS} s.</div>` : null}
        ${!lock ? html`<div class=${'si-field' + (idErr ? ' bad' : '')}><label for="si-id">Employee ID or email</label>
          <div class="si-input"><${Icon} n="user" /><input id="si-id" ref=${idRef} autoComplete="username" spellCheck="false" value=${id} placeholder="MG-1234 or name@mgjw.pk" aria-invalid=${idErr ? 'true' : 'false'} aria-describedby=${idErr ? 'si-id-e' : null} onInput=${(e) => { setId(e.target.value); setErr(null); }} /></div>
          ${idErr ? html`<div class="si-hint bad" id="si-id-e">${idErr}</div>` : null}</div>` : null}
        <div class=${'si-field' + (pwErr ? ' bad' : '')}><div class="si-lab"><label for="si-pw">Password</label>${!lock ? html`<button type="button" class="linkish" onClick=${() => setErr('Passwords are reset by your administrator. Ask them for a temporary password.')}>Forgot password?</button>` : null}</div>
          <div class="si-input"><${Icon} n="lock" /><input id="si-pw" ref=${pwRef} type=${show ? 'text' : 'password'} autoComplete="current-password" value=${pw} aria-invalid=${pwErr ? 'true' : 'false'} onInput=${(e) => { setPw(e.target.value); setErr(null); }} onKeyUp=${keyCaps} onKeyDown=${keyCaps} />
            <button type="button" class="si-eye" aria-label=${show ? 'Hide password' : 'Show password'} aria-pressed=${show} onClick=${() => setShow(!show)}><${Icon} n=${show ? 'eyeoff' : 'eye'} /></button></div>
          ${pwErr ? html`<div class="si-hint bad">${pwErr}</div>` : caps ? html`<div class="si-hint warn"><${Icon} n="alert" />Caps Lock is on</div>` : null}</div>
        ${!lock ? html`<label class="si-check"><input type="checkbox" checked=${keep} onChange=${(e) => setKeep(e.target.checked)} /><span>Keep me signed in on this device</span></label>` : null}
        <button type="submit" class="btn primary lg si-go" aria-busy=${busy ? 'true' : 'false'} disabled=${busy || waitS > 0}>${busy ? 'Checking…' : lock ? 'Unlock' : 'Sign in'}<${Icon} n="chev" /></button>
        ${lock ? html`<button type="button" class="btn ghost si-alt" onClick=${() => Auth.signOut()}><${Icon} n="logout" />Sign in as someone else</button>` : html`
          <div class="si-or"><span>or</span></div>
          <button type="button" class="btn si-alt" disabled title="Available when deployed on the plant network"><${Icon} n="building" />Sign in with MG JW account (SSO)<span class="si-soon">at deployment</span></button>`}
        ${!lock ? html`<div class="si-demo"><button type="button" class="si-demo-h" aria-expanded=${demo} onClick=${() => setDemo(!demo)}><span><${Icon} n="key" />Demo access</span><span class="c-muted">${demo ? 'Hide' : 'Show'} the five role accounts</span></button>
          ${demo ? html`<div class="si-accts">${DEMO_USERS.map((u) => html`<button type="button" key=${u.id} class="si-acct" onClick=${() => fill(u)} title=${ROLES[u.role].desc}>
            <span class=${'av r-' + u.role}>${initials(u.name)}</span><span class="nm"><b>${u.name}</b><small>${ROLES[u.role].label}</small></span><span class="mono c-muted">${u.empId}</span></button>`)}</div>
            <p class="si-note">Pick an account to fill the form, then sign in. Each role sees and can do different things.</p>` : null}</div>` : null}
        <p class="si-fine">${lock ? null : html`Line displays don't need a sign-in: <a href="#/display/chassis" class="linkish">open a line display</a>. `}Prototype: accounts and sessions are kept in this browser only. The plant deployment signs in through the company directory.</p>
      </form>
    </section>
  </div>`;
}
/* calm animated flow of the three lines, used on the sign-in brand panel */
function SignInFlow() {
  const S = RT.S, lines = [['TRIM', 'Trim', 6], ['CHASSIS', 'Chassis', 4], ['FINAL', 'Final', 7]];
  return html`<svg class="si-flow" viewBox="0 0 520 150" role="img" aria-label="Live station states on the three lines">
    ${lines.map(([a, name, n], li) => { const y = 24 + li * 46, ids = M.AREA_STATIONS[a]; return html`<g key=${a}>
      <text x="0" y=${y + 4} class="si-flow-l">${name}</text>
      <line x1="70" x2="510" y1=${y} y2=${y} class="si-flow-rail" />
      ${ids.map((id, i) => { const st = M.andonState(S, id).state, x = 70 + (i + 0.5) * (440 / n), c = M.callsAt(S, id)[0]; return html`<g key=${id}><rect x=${x - 15} y=${y - 9} width="30" height="18" class=${'si-st s-' + st} />${c ? html`<circle cx=${x + 15} cy=${y - 9} r="4" class=${'si-call c-' + c.type.toLowerCase()} />` : null}</g>`; })}
    </g>`; })}
  </svg>`;
}

/* ── user menu (top bar) ── */
export function UserMenu() {
  const u = Auth.user; if (!u) return null;
  const open = RT.ui.menu;
  return html`<div class="umenu"><button class=${'ubtn r-' + u.role} aria-haspopup="menu" aria-expanded=${!!open} title=${`${u.name} · ${ROLES[u.role].label}`} onClick=${() => setUI({ menu: !open })}>${initials(u.name)}</button>
    ${open ? html`<div class="glass umenu-pop ticks" role="menu">
      <div class="um-head"><span class=${'av r-' + u.role}>${initials(u.name)}</span><div><b>${u.name}</b><div class="c-muted" style=${{ fontSize: 12 }}>${ROLES[u.role].label} · ${u.empId}</div></div></div>
      <p class="note">${ROLES[u.role].desc}</p>
      <div class="micro" style=${{ margin: '8px 0 4px' }}>Switch demo user</div>
      ${Auth.users.filter((x) => x.active && x.id !== u.id).map((x) => html`<button key=${x.id} class="um-item" role="menuitem" onClick=${() => Auth.switchTo(x)}><span class=${'av sm r-' + x.role}>${initials(x.name)}</span>${x.name}<span class="c-muted">${ROLES[x.role].short}</span></button>`)}
      <div class="um-sep"></div>
      <button class="um-item" role="menuitem" onClick=${() => { Auth.locked = true; Auth.record('Screen locked', u.name); setUI({ menu: false }); }}><${Icon} n="lock" />Lock screen</button>
      <button class="um-item" role="menuitem" onClick=${() => Auth.signOut()}><${Icon} n="logout" />Sign out</button>
    </div>` : null}</div>`;
}
