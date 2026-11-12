/* Andon DS · forms: Field (label, hint, error) wrapping the inputs. Every input gets its label through
   Field, its hint and error through aria-describedby, and aria-invalid when the error is shown. */
import React from 'react';
import { html } from '../lib/runtime.js';
import { cx } from './layout.js';

const FieldCtx = React.createContext(null);

/**
 * @param {{ label: any, hint?: any, error?: any, required?: boolean, id?: string, inline?: boolean, children: any }} p
 * The child input picks up id, aria-describedby and aria-invalid automatically.
 */
export function Field({ label, hint, error, required, id, inline, class: cls, style, children }) {
  const auto = React.useId(), fid = id || `f${auto.replace(/:/g, '')}`;
  const desc = [hint && `${fid}-h`, error && `${fid}-e`].filter(Boolean).join(' ') || undefined;
  return html`<div class=${cx('ds-field', inline && 'ds-field--inline', cls)} style=${style}>
    <label class="ds-field__label" for=${fid}>${label}${required ? html`<span class="ds-field__req" aria-hidden="true"> *</span>` : null}</label>
    <${FieldCtx.Provider} value=${{ id: fid, desc, invalid: !!error, required }}>${children}</${FieldCtx.Provider}>
    ${hint ? html`<span class="ds-field__hint" id=${`${fid}-h`}>${hint}</span>` : null}
    ${error ? html`<span class="ds-field__error" id=${`${fid}-e`} role="alert">${error}</span>` : null}
  </div>`;
}

function useField(props) {
  const f = React.useContext(FieldCtx) || {};
  return { id: props.id || f.id, 'aria-describedby': props['aria-describedby'] || f.desc, 'aria-invalid': props.invalid || f.invalid ? 'true' : undefined, required: props.required ?? f.required };
}
const val = (fn, number) => (e) => fn && fn(number ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value);

/** Text input. onChange gets the value. */
export function TextInput({ value, onChange, invalid, class: cls, size = 'md', ...rest }) {
  const a = useField({ invalid, ...rest });
  return html`<input class=${cx('ds-input', `ds-input--${size}`, cls)} value=${value ?? ''} onInput=${val(onChange)} ...${rest} ...${a} />`;
}
/**
 * Number input. While someone types, the field keeps exactly what they typed and onChange gets the number only
 * when it is inside min–max, so a half-typed value never snaps (typing 7 into an empty field gives 7, not 17).
 * On leaving the field an empty value goes back to the current one, and an out-of-range value is clamped, with a
 * visible "adjusted" note (audit B11). Without min/max every number is passed on, '' when empty.
 */
export function NumberInput({ value, onChange, invalid, class: cls, size = 'md', min, max, ...rest }) {
  const a = useField({ invalid, ...rest });
  const [draft, setDraft] = React.useState(null), [note, setNote] = React.useState(null);
  const lo = min === undefined || min === '' ? -Infinity : +min, hi = max === undefined || max === '' ? Infinity : +max;
  const bounded = lo > -Infinity || hi < Infinity;
  React.useEffect(() => { if (!note) return undefined; const t = setTimeout(() => setNote(null), 4000); return () => clearTimeout(t); }, [note]);
  const input = (e) => {
    const t = e.target.value; setDraft(t); setNote(null);
    if (!bounded) { onChange && onChange(t === '' ? '' : Number(t)); return; }
    const n = Number(t);
    if (t !== '' && Number.isFinite(n) && n >= lo && n <= hi) onChange && onChange(n);
  };
  const commit = () => {
    if (draft === null) return;
    const t = draft; setDraft(null);
    if (!bounded || t === '') return;
    const n = Number(t);
    if (!Number.isFinite(n)) return;
    const c = Math.min(hi, Math.max(lo, n));
    if (c !== n) { onChange && onChange(c); setNote(`Adjusted to ${c}: allowed ${lo > -Infinity ? lo : '…'}–${hi < Infinity ? hi : '…'}`); }
  };
  const field = html`<input type="number" inputmode="decimal" class=${cx('ds-input', 'ds-input--num', `ds-input--${size}`, cls)} min=${min} max=${max}
    value=${draft ?? value ?? ''} onInput=${input} onBlur=${commit} onKeyDown=${(e) => { if (e.key === 'Enter') commit(); }} ...${rest} ...${a} />`;
  return note ? html`${field}<span class="ds-field__note" role="status">${note}</span>` : field;
}
/** Date (YYYY-MM-DD) and time (HH:MM) inputs. */
export function DateInput({ value, onChange, invalid, class: cls, size = 'md', ...rest }) {
  const a = useField({ invalid, ...rest });
  return html`<input type="date" class=${cx('ds-input', `ds-input--${size}`, cls)} value=${value ?? ''} onChange=${val(onChange)} ...${rest} ...${a} />`;
}
export function TimeInput({ value, onChange, invalid, class: cls, size = 'md', ...rest }) {
  const a = useField({ invalid, ...rest });
  return html`<input type="time" class=${cx('ds-input', `ds-input--${size}`, cls)} value=${value ?? ''} onInput=${val(onChange)} ...${rest} ...${a} />`;
}
/** Multi-line text. */
export function Textarea({ value, onChange, invalid, class: cls, rows = 3, ...rest }) {
  const a = useField({ invalid, ...rest });
  return html`<textarea class=${cx('ds-input', 'ds-textarea', cls)} rows=${rows} value=${value ?? ''} onInput=${val(onChange)} ...${rest} ...${a}></textarea>`;
}
/**
 * Native select (best on touch screens). options: [value, label] pairs or { value, label } objects.
 * @param {{ value: any, onChange: (v: string) => void, options: any[] }} p
 */
export function Select({ value, onChange, options, invalid, class: cls, size = 'md', ...rest }) {
  const a = useField({ invalid, ...rest });
  return html`<select class=${cx('ds-input', 'ds-select', `ds-input--${size}`, cls)} value=${value} onChange=${val(onChange)} ...${rest} ...${a}>${options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o.value, o.label]; return html`<option key=${String(v)} value=${v}>${l}</option>`; })}</select>`;
}
