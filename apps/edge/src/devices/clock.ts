/* The plant clock for live running: engine time is seconds since 00:00 of the engine's base date, on the
   plant's local time (PLANT_TZ, default Asia/Karachi). */
const fmt = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string, at: number) {
  let f = fmt.get(tz);
  if (!f) { f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); fmt.set(tz, f); }
  const p = Object.fromEntries(f.formatToParts(new Date(at)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, sec: Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) };
}
/** Today's date and the seconds since local midnight on the plant clock. */
export const plantNow = (tz: string, at = Date.now()) => parts(tz, at);
/** Engine time for a wall-clock instant, against the engine's base date. */
export function plantT(tz: string, baseDate: string, at = Date.now()) {
  const { date, sec } = parts(tz, at);
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${baseDate}T00:00:00Z`)) / 86_400_000);
  return days * 86400 + sec;
}
