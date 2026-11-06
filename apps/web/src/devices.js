/* Settings → Devices: commissioning the plant's devices (line server only, administrators).
   Each device's connection, every mapped signal with its live value (flashing on change), and the last
   signals and the plant events they produced, with problems highlighted. In simulation or shadow mode a
   signal can be sent by hand to check the mapping. */
import { Button, Cluster, DataTable, Field, Grid, Notice, PageHeader, Panel, Stack, Tag, TextInput } from './ui/index.js';
import { api } from './lib/api.js';
import { html, useEffect, useState } from './lib/runtime.js';

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
  if (err && !d) return html`<${Notice} kind="error">${err}<//>`;
  if (!d) return html`<p class="note" role="status">Loading devices…</p>`;
  const [modeLabel, modeText] = MODE[d.mode] || MODE.simulation;
  const q = filter.trim().toLowerCase();
  const tags = d.tags.filter((t) => !q || `${t.pos} ${t.address} ${t.label || ''} ${MEANS[t.means]}`.toLowerCase().includes(q));
  const send = async (t, value) => { const r = await api('/api/devices/test', { body: { device: t.device, address: t.address, value } }); setMsg(r.ok ? { ok: true, text: `Sent ${t.address} = ${value ? 'on' : 'off'}.` } : { ok: false, text: r.error }); };
  const manual = d.mode !== 'live' && d.devices.length > 0;
  const tagCols = [
    { key: 'pos', label: 'Station', type: 'code' },
    { key: 'means', label: 'Meaning', render: (t) => `${MEANS[t.means]}${t.callType ? ` · ${t.callType === 'SUP' ? 'supervisor' : 'maintenance'}` : ''}` },
    { key: 'address', label: 'Address', type: 'code', render: (t) => `${t.device} · ${t.address}` },
    { key: 'value', label: 'Value', render: (t) => html`<span class=${'dev-val ' + (t.value ? 'on' : t.value === false ? 'off' : '')}>${t.value == null ? 'no value' : t.value ? 'ON' : 'off'}</span>` },
    { key: 'changed', label: 'Changed', type: 'time', render: (t) => ago(t.changedAt) },
    ...(manual ? [{ key: 'act', label: '', type: 'action', render: (t) => html`<${Cluster} gap=${1} justify="flex-end" nowrap=${true}><${Button} size="sm" variant="ghost" onClick=${() => send(t, true)}>On<//><${Button} size="sm" variant="ghost" onClick=${() => send(t, false)}>Off<//></${Cluster}>` }] : []),
  ];
  const logCols = [
    { key: 'at', label: 'Time', type: 'time', render: (l) => clock(l.at) }, { key: 'device', label: 'Device', type: 'code' },
    { key: 'signal', label: 'Signal', type: 'code', render: (l) => (l.address ? `${l.address}${l.value !== undefined ? ` = ${l.value === true ? 'on' : l.value === false ? 'off' : l.value}` : ''}` : l.value !== undefined ? String(l.value) : '') },
    { key: 'what', label: 'What happened', wrap: true, render: (l) => l.event || l.note || '' },
  ];
  return html`<${Stack} gap=${4} class="devices">
    <${PageHeader} k="Devices · URD §6 integration" title=${`Plant devices · ${modeLabel}`} sub=${modeText} />
    ${err ? html`<${Notice} kind="error">${err}<//>` : null}
    ${d.devices.length ? html`<${Grid} min=${240}>${d.devices.map((x) => { const [label, tone] = STATE[x.state] || ['—', '']; return html`<${Panel} key=${x.id} edge=${tone === 'good' ? 'normal' : tone === 'bad' ? 'critical' : null}
      title=${html`<span class="mono">${x.id}</span>`} sub=${x.kind === 'opcua' ? 'PLC · OPC UA' : x.kind === 'modbus' ? 'PLC · Modbus TCP' : 'VIN scanner · network'}>
      <span class="mono c-muted" style=${{ wordBreak: 'break-all' }}>${x.target}</span>
      <${Tag} tone=${tone === 'good' ? 'normal' : tone === 'bad' ? 'critical' : null} icon=${x.state === 'connected' ? 'wifi' : 'wifioff'}>${label} · ${ago(x.since)}<//>
      <span class="note">${x.signals ? `${x.signals} signals · ` : ''}last signal ${ago(x.lastSignalAt)}${x.error ? html`<br /><span class="c-crit">${x.error}</span>` : ''}</span><//>`; })}</${Grid}>` : html`<p class="note">No devices configured.</p>`}
    ${msg ? html`<${Notice} kind=${msg.ok ? 'success' : 'error'}>${msg.text}<//>` : null}
    ${d.tags.length ? html`<${Panel} ticks=${true} title="Signals" sub=${`Every address in the device map and its value now. A value that changes flashes.${manual ? ' Use On / Off to send a signal by hand and check what it does.' : ''}`}>
      <${Field} label="Filter" style=${{ maxWidth: 320 }}><${TextInput} value=${filter} onChange=${setFilter} placeholder="Station, address or meaning" /><//>
      <${DataTable} columns=${tagCols} rows=${tags} rowKey=${(t) => t.device + t.address} rowClass=${(t) => (t.changedAt && Date.now() - t.changedAt < 1500 ? 'flash' : null)} empty="No signal matches the filter." /><//>` : null}
    <${Panel} ticks=${true} title="Signal log" sub="The last 500 signals and the plant events they produced, newest first.">
      <${DataTable} columns=${logCols} rows=${d.log.slice(0, 200)} rowClass=${(l) => (l.problem ? 'problem' : null)} status=${(l) => (l.problem ? 'critical' : null)} empty="Nothing yet." /><//>
  </${Stack}>`;
}
