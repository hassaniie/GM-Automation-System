/* Settings → Devices: commissioning the plant's devices (line server only, administrators).
   Each device's connection, every mapped signal with its live value (flashing on change), and the last
   signals and the plant events they produced, with problems highlighted. In simulation or shadow mode a
   signal can be sent by hand to check the mapping. */
import { PageHead } from './admin.js';
import { api } from './lib/api.js';
import { html, useEffect, useState } from './lib/runtime.js';
import { Icon } from './lib/ui-kit.js';

const MODE = {
  live: ['Live', 'Device signals drive the plant shown on every screen.'],
  shadow: ['Shadow', 'Devices are connected and their signals logged here, but the screens still run the simulator. Use this to check every signal before going live.'],
  simulation: ['Simulation', 'No devices are connected. Start the line server with PLANT_MODE=shadow or live and a device map (config/devices.json).'],
};
const MEANS = { presence: 'Carrier present', 'transfer-done': 'Transfer done', 'photo-eye': 'Photo-eye', 'call-button': 'Call button', 'work-done': 'Work done' };
const STATE = { connected: ['Connected', 'good'], connecting: ['Connecting', ''], down: ['Not connected', 'bad'], silent: ['Silent', 'bad'] };
const ago = (at) => { if (!at) return '—'; const s = Math.round((Date.now() - at) / 1000); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(at).toLocaleTimeString('en-GB'); };
const clock = (at) => new Date(at).toLocaleTimeString('en-GB', { hour12: false }) + '.' + String(at % 1000).padStart(3, '0');

export function DeviceAdmin() {
  const [d, setD] = useState(null), [err, setErr] = useState(null), [filter, setFilter] = useState(''), [msg, setMsg] = useState(null);
  useEffect(() => {
    let on = true;
    const load = () => api('/api/devices').then((r) => { if (!on) return; if (r.ok) { setD(r); setErr(null); } else setErr(r.error || 'The line server did not answer.'); });
    load(); const i = setInterval(load, 1000);
    return () => { on = false; clearInterval(i); };
  }, []);
  if (err && !d) return html`<div class="result bad">${err}</div>`;
  if (!d) return html`<p class="note" role="status">Loading devices…</p>`;
  const [modeLabel, modeText] = MODE[d.mode] || MODE.simulation;
  const q = filter.trim().toLowerCase();
  const tags = d.tags.filter((t) => !q || `${t.pos} ${t.address} ${t.label || ''} ${MEANS[t.means]}`.toLowerCase().includes(q));
  const send = async (t, value) => { const r = await api('/api/devices/test', { body: { device: t.device, address: t.address, value } }); setMsg(r.ok ? { ok: true, text: `Sent ${t.address} = ${value ? 'on' : 'off'}.` } : { ok: false, text: r.error }); };
  const manual = d.mode !== 'live' && d.devices.length > 0;
  return html`<div class="devices">
    <${PageHead} k="Devices · URD §6 integration" title=${`Plant devices · ${modeLabel}`} sub=${modeText} />
    ${err ? html`<div class="result bad">${err}</div>` : null}
    <div class="dev-cards">${d.devices.length ? d.devices.map((x) => { const [label, tone] = STATE[x.state] || ['—', '']; return html`<div key=${x.id} class=${'dev-card ' + tone}>
      <div class="micro">${x.kind === 'opcua' ? 'PLC · OPC UA' : x.kind === 'modbus' ? 'PLC · Modbus TCP' : 'VIN scanner · network'}</div>
      <b class="mono">${x.id}</b><span class="mono c-muted" style=${{ wordBreak: 'break-all' }}>${x.target}</span>
      <span class=${'dev-state ' + tone}><${Icon} n=${x.state === 'connected' ? 'wifi' : 'wifioff'} size=${12} />${label} · ${ago(x.since)}</span>
      <span class="note">${x.signals ? `${x.signals} signals · ` : ''}last signal ${ago(x.lastSignalAt)}${x.error ? html`<br /><span class="c-crit">${x.error}</span>` : ''}</span></div>`; }) : html`<p class="note">No devices configured.</p>`}</div>
    <${Msg} msg=${msg} />
    ${d.tags.length ? html`<section class="panel ticks rsec"><h3>Signals</h3><div class="q">Every address in the device map and its value now. A value that changes flashes. ${manual ? 'Use On / Off to send a signal by hand and check what it does.' : ''}</div>
      <div class="field" style=${{ maxWidth: 320 }}><label for="dv-f">Filter</label><input id="dv-f" value=${filter} onInput=${(e) => setFilter(e.target.value)} placeholder="Station, address or meaning" /></div>
      <table class="data"><thead><tr><th>Station</th><th>Meaning</th><th>Address</th><th>Value</th><th>Changed</th>${manual ? html`<th></th>` : null}</tr></thead><tbody>
        ${tags.map((t) => html`<tr key=${t.device + t.address} class=${t.changedAt && Date.now() - t.changedAt < 1500 ? 'flash' : ''}>
          <td class="mono" style=${{ textAlign: 'left' }}>${t.pos}</td><td style=${{ textAlign: 'left' }}>${MEANS[t.means]}${t.callType ? ` · ${t.callType === 'SUP' ? 'supervisor' : 'maintenance'}` : ''}</td>
          <td class="mono" style=${{ textAlign: 'left' }}>${t.device} · ${t.address}</td>
          <td><span class=${'dev-val ' + (t.value ? 'on' : t.value === false ? 'off' : '')}>${t.value == null ? 'no value' : t.value ? 'ON' : 'off'}</span></td>
          <td class="mono">${ago(t.changedAt)}</td>
          ${manual ? html`<td><button class="btn sm ghost" onClick=${() => send(t, true)}>On</button> <button class="btn sm ghost" onClick=${() => send(t, false)}>Off</button></td>` : null}</tr>`)}
      </tbody></table></section>` : null}
    <section class="panel ticks rsec"><h3>Signal log</h3><div class="q">The last 500 signals and the plant events they produced, newest first.</div>
      <table class="data"><thead><tr><th>Time</th><th>Device</th><th>Signal</th><th>What happened</th></tr></thead><tbody>
        ${d.log.length ? d.log.slice(0, 200).map((l, i) => html`<tr key=${i} class=${l.problem ? 'problem' : ''}><td class="mono">${clock(l.at)}</td><td class="mono">${l.device}</td>
          <td class="mono" style=${{ textAlign: 'left' }}>${l.address ? `${l.address}${l.value !== undefined ? ` = ${l.value === true ? 'on' : l.value === false ? 'off' : l.value}` : ''}` : l.value !== undefined ? String(l.value) : ''}</td>
          <td style=${{ textAlign: 'left', whiteSpace: 'normal' }}>${l.event || l.note || ''}</td></tr>`) : html`<tr><td colspan="4" class="c-muted">Nothing yet.</td></tr>`}
      </tbody></table></section>
  </div>`;
}

const Msg = ({ msg }) => (msg ? html`<div class=${'result ' + (msg.ok ? 'good' : 'bad')} role="status">${msg.text}</div>` : null);
