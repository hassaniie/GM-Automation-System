/* Andon DS · core components (apps/web/src/ui): every variant, size and state. */
import React from 'react';
import { html } from '../lib/runtime.js';
import {
  Button, Cluster, DataTable, DateInput, Dialog, Drawer, EmptyState, Field, Grid, IconButton, Menu, Meter, Notice, NumberInput,
  PageHeader, Panel, SegmentedControl, Select, Skeleton, Stack, Stat, Switch, Tabs, Tag, TextInput, Textarea, TimeInput,
} from '../ui/index.js';

export default { title: 'Components/Core' };
const Page = ({ title, intro, children }) => html`<div class="cat"><div><h1>${title}</h1>${intro ? html`<p>${intro}</p>` : null}</div>${children}</div>`;
const Row = ({ label, children }) => html`<section><h2>${label}</h2><${Cluster} gap=${3}>${children}</${Cluster}></section>`;

export const Buttons = {
  render: () => html`<${Page} title="Button" intro="Primary is the one main action on a screen. Secondary is the default. Ghost is low emphasis. Danger is destructive. A tone colours a secondary button for a domain action (call types, simulator); pressed fills it. Controls are 36 px with a mouse, 44 px on touch screens and 56 px with Large touch targets.">
    <${Row} label="Variants"><${Button} variant="primary" icon="check">Save<//><${Button}>Cancel<//><${Button} variant="ghost">More details<//><${Button} variant="danger" icon="exit">Take offline<//></${Row}>
    <${Row} label="Sizes"><${Button} size="sm">Small<//><${Button}>Medium<//><${Button} size="lg" variant="primary" iconRight="chev">Large<//></${Row}>
    <${Row} label="Tones and pressed"><${Button} tone="sup" icon="user">Supervisor<//><${Button} tone="sup" icon="user" pressed=${true}>Supervisor<//><${Button} tone="mnt" icon="wrench">Maintenance<//><${Button} tone="sim" icon="flask">Simulator<//></${Row}>
    <${Row} label="States"><${Button} disabled>Disabled<//><${Button} variant="primary" loading=${true}>Saving…<//><${Button} href="#">Link button<//></${Row}>
    <${Row} label="Icon buttons"><${IconButton} icon="search" label="Find a vehicle" /><${IconButton} icon="x" label="Close" size="sm" /><${IconButton} icon="bell" label="Alarms" variant="secondary" /></${Row}>
  </${Page}>`,
};

export const Choice = {
  name: 'Segmented control and switch',
  render: function Story() {
    const [s, setS] = React.useState(15), [v, setV] = React.useState('overview'), [on, setOn] = React.useState(true);
    return html`<${Page} title="Segmented control and switch" intro="A segmented control picks one of a few options; arrow keys move the choice. A switch turns a setting on or off and always has a label.">
      <${Row} label="Segmented"><${SegmentedControl} label="Simulation speed" value=${s} onChange=${setS} options=${[1, 5, 15, 60].map((x) => ({ value: x, label: `${x}×` }))} />
        <${SegmentedControl} label="View" value=${v} onChange=${setV} options=${[{ value: 'overview', label: 'Shop', icon: 'layers' }, { value: '2D', label: 'Plan', icon: 'map' }]} /></${Row}>
      <${Row} label="Switch"><${Switch} checked=${on} onChange=${setOn} label="Automatic responders" hint="Simulated supervisors answer calls" /><${Switch} checked=${false} onChange=${() => {}} label="Disabled" disabled=${true} /></${Row}>
    </${Page}>`;
  },
};

export const Forms = {
  render: function Story() {
    const [t, setT] = React.useState('Rebalance after adding CL3'), [n, setN] = React.useState(9), [sel, setSel] = React.useState('chassis');
    return html`<${Page} title="Fields and inputs" intro="Every input sits in a Field: label, optional hint, and an error that is announced and linked to the input.">
      <${Grid} min=${260} gap=${5}>
        <${Field} label="Reason for the change" hint="Kept in the audit log" required=${true}><${TextInput} value=${t} onChange=${setT} /><//>
        <${Field} label="Takt (minutes)"><${NumberInput} value=${n} onChange=${setN} min="1" max="60" /><//>
        <${Field} label="Line"><${Select} value=${sel} onChange=${setSel} options=${[['trim', 'Trim'], ['chassis', 'Chassis'], ['final', 'Final']]} /><//>
        <${Field} label="From"><${DateInput} value="2026-11-06" onChange=${() => {}} /><//>
        <${Field} label="Shift start"><${TimeInput} value="06:00" onChange=${() => {}} /><//>
        <${Field} label="Employee ID" error="That ID is already in use."><${TextInput} value="MG-1001" onChange=${() => {}} /><//>
        <${Field} label="Notes"><${Textarea} value="" onChange=${() => {}} placeholder="What was done" /><//>
        <${Field} label="Disabled"><${TextInput} value="Read only" onChange=${() => {}} disabled=${true} /><//>
      </${Grid}>
    </${Page}>`;
  },
};

export const Containers = {
  name: 'Panel, stat and meter',
  render: () => html`<${Page} title="Panel, stat and meter" intro="Panels are plain on pages and glass only over the 3D floor; corner ticks mark primary objects. Stats are neutral unless the figure is a problem. Meters show progress against plan, with a marker.">
    <${Grid} min=${320} gap=${4}>
      <${Panel} title="Final line" sub="Shift A · 06:00–14:30" ticks=${true} edge="normal" actions=${html`<${IconButton} icon="tv" label="Open the line display" size="sm" />`}>
        <${Cluster} gap=${6}><${Stat} label="Completed" value="15" target="30" delta="+1 ahead" /><${Stat} label="Downtime" value="06:51" /><${Stat} label="Downtime" value="38:10" tone="critical" title="Above 10 % of the shift" /></${Cluster}>
        <${Meter} value=${0.5} marker=${0.48} label="Completed against target" valueText="15 of 30" />
      <//>
      <${Panel} title="Glass (over the 3D floor only)" variant="glass"><${Stat} label="In process" value="11" unit="vehicles" size="sm" /><//>
      <${Panel} title="Sizes"><${Stat} label="Small" value="15" size="sm" /><${Stat} label="Large" value="15" size="lg" /><${Stat} label="Display (TV)" value="15" size="display" /><//>
    </${Grid}>
  </${Page}>`,
};

const ROWS = [
  { vin: 'LSJA2YH49TP248214', station: 'FL3', t: 35420, reason: 'Part fitment issue', by: 'Usman Tariq', dur: 1260, tone: 'critical' },
  { vin: 'LSJA34660TP248203', station: 'TL6', t: 32010, reason: 'Paint defect', by: 'Usman Tariq', dur: 540, tone: null },
  { vin: 'LSJA2Y522TP248221', station: 'FL5', t: 30111, reason: 'Missing part', by: 'Bilal Ahmed', dur: 2100, tone: 'warning' },
];
const COLS = [
  { key: 'vin', label: 'VIN', type: 'vin' }, { key: 'station', label: 'Station', type: 'code' }, { key: 'reason', label: 'Reason', wrap: true },
  { key: 'by', label: 'By' }, { key: 'dur', label: 'Offline for', type: 'duration' },
];
export const Table = {
  render: () => html`<${Page} title="Data table" intro="Numbers, times and codes align right and use tabular figures. A row can carry a status edge. Empty, loading and error states are built in.">
    <${Panel} title="Offlined vehicles"><${DataTable} columns=${COLS} rows=${ROWS} rowKey=${(r) => r.vin} status=${(r) => r.tone} /><//>
    <${Grid} min=${360}><${Panel} title="Empty"><${DataTable} columns=${COLS} rows=${[]} empty="No vehicles offlined this shift." /><//><${Panel} title="Loading"><${DataTable} columns=${COLS} rows=${null} /><//><${Panel} title="Error"><${DataTable} columns=${COLS} rows=${[]} error="The line server did not answer." /><//></${Grid}>
  </${Page}>`,
};

export const Feedback = {
  name: 'Tag, notice, empty, skeleton',
  render: () => html`<${Page} title="Tags, notices and empty states">
    <${Row} label="Tags"><${Tag} tone="normal">Running<//><${Tag} tone="warning">Close to limit<//><${Tag} tone="critical">Over takt<//><${Tag} tone="held">Held by FL1<//><${Tag} tone="sim">Simulation<//><${Tag} tone="critical" variant="solid">Stopped<//></${Row}>
    <${Stack} gap=${3}><${Notice} kind="info" title="Information">Changes apply at once on every screen.<//><${Notice} kind="success" title="Saved">Takt for the Chassis line is now 09:00.<//><${Notice} kind="warning" title="Check">Two stations are close to takt.<//><${Notice} kind="error" title="Not saved">The line server did not answer.<//><${Notice} kind="critical" title="Emergency stop" actions=${html`<${Button} size="sm" variant="danger">Clear<//>`}>FL4 emergency stop pressed.<//></${Stack}>
    <${Panel}><${EmptyState} icon="chart" title="No shift has run yet">Reports appear once a shift has started.<//><//>
    <${Stack} gap=${2} style=${{ maxWidth: 320 }}><${Skeleton} /><${Skeleton} width="60%" /><${Skeleton} height=${32} /></${Stack}>
  </${Page}>`,
};

export const Navigation = {
  name: 'Page header, tabs, menu',
  render: function Story() {
    const [t, setT] = React.useState('takt'), [v, setV] = React.useState('active');
    return html`<${Page} title="Page header, tabs and menu">
      <${PageHeader} k="Settings · URD req 10" title="Takt time" sub="Changes apply at once and are written to the audit log."><${Button}>Cancel<//><${Button} variant="primary">Save<//><//>
      <${Tabs} label="Alarms" value=${v} onChange=${setV} items=${[{ value: 'active', label: 'Active', count: 3 }, { value: 'acked', label: 'Acknowledged', count: 1 }, { value: 'resolved', label: 'Resolved' }]} />
      <div style=${{ width: 240 }}><${Tabs} vertical=${true} label="Settings" value=${t} onChange=${setT} items=${[{ value: 'takt', label: 'Takt time', icon: 'clock' }, { value: 'plan', label: 'Targets & plan', icon: 'calendar' }, { value: 'users', label: 'Users', icon: 'users' }]} /></div>
      <${Menu} label="Tools" trigger=${(p) => html`<${IconButton} icon="more" label="Tools" ...${p} />`} items=${[{ label: 'Find a vehicle', icon: 'search', onSelect: () => {} }, { label: 'Line-in scan', icon: 'scanin', onSelect: () => {} }, 'separator', { label: 'Sign out', icon: 'logout', onSelect: () => {}, danger: true }]} />
    </${Page}>`;
  },
};

export const Overlays = {
  name: 'Dialog and drawer',
  render: function Story() {
    const [d, setD] = React.useState(false), [w, setW] = React.useState(false);
    return html`<${Page} title="Dialog and drawer" intro="Dialogs trap focus, close with Escape or the backdrop and return focus to the button that opened them. Drawers slide in from the right for alarms and calls.">
      <${Cluster}><${Button} onClick=${() => setD(true)}>Open dialog<//><${Button} onClick=${() => setW(true)}>Open drawer<//></${Cluster}>
      ${d ? html`<div style=${{ position: 'fixed', inset: 0 }}><${Dialog} k="Authorised · audited" title="Correct vehicle position" onClose=${() => setD(false)} footer=${html`<${Button} onClick=${() => setD(false)}>Cancel<//><${Button} variant="primary" onClick=${() => setD(false)}>Correct<//>`}>
        <${Field} label="Move to"><${Select} value="FL3" onChange=${() => {}} options=${[['FL2', 'FL2'], ['FL3', 'FL3']]} /><//><${Field} label="Reason" required=${true}><${TextInput} value="" onChange=${() => {}} /><//></${Dialog}></div>` : null}
      ${w ? html`<div style=${{ position: 'fixed', inset: 0 }}><${Drawer} k="3 open" title="Alarms" onClose=${() => setW(false)}><${Notice} kind="critical" title="FL4 · escalated">Over takt by 04:12.<//><${Notice} kind="warning" title="CL2 · close to takt">09:18 of 10:00.<//></${Drawer}></div>` : null}
    </${Page}>`;
  },
};
