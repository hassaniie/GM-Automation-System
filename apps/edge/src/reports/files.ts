/* Report files: Excel (exceljs) and PDF (pdfmake, all in Node with its bundled Roboto fonts). Both use the
   same tables as the Reports page (@mg/reports reportSheets). */
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import ExcelJS from 'exceljs';
import { fmtDur } from '@mg/core';
import { reportSheets, type ReportMeta } from '@mg/reports';
import type { ServerReport } from './data.ts';

type Cell = string | number;

export async function reportXlsx(r: ServerReport, meta: ReportMeta): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MG GA Andon'; wb.created = new Date();
  for (const [name, rows] of Object.entries(reportSheets(r.report, meta))) {
    const ws = wb.addWorksheet(name.slice(0, 31));
    ws.addRows(rows);
    ws.columns.forEach((c, i) => { c.width = Math.min(48, Math.max(10, ...rows.map((row) => String(row[i] ?? '').length + 2))); });
    if (name !== 'About') { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: rows[0].length } }; }
    else ws.getRow(1).font = { bold: true, size: 13 };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* pdfmake (CommonJS); fonts are read from its own package folder only, and no URL is ever fetched */
const require = createRequire(import.meta.url);
interface PdfMake { setFonts(f: unknown): void; setUrlAccessPolicy(f: (u: string) => boolean): void; setLocalAccessPolicy(f: (p: string) => boolean): void; createPdf(d: unknown): { getBuffer(): Promise<Buffer> } }
let pdfmake: PdfMake | null = null;
function pdf(): PdfMake {
  if (pdfmake) return pdfmake;
  const m = require('pdfmake') as PdfMake;
  const fonts = require('pdfmake/fonts/Roboto.js'), fontDir = dirname(require.resolve('pdfmake/fonts/Roboto.js'));
  m.setFonts(fonts);
  m.setUrlAccessPolicy(() => false);
  m.setLocalAccessPolicy((p: string) => p.startsWith(fontDir));
  return (pdfmake = m);
}

const INK = '#1b1d21', MUTED = '#6b7078', HAIR = '#d9dce1';

export async function reportPdf(r: ServerReport, meta: ReportMeta): Promise<Buffer> {
  const sheets = reportSheets(r.report, meta), k = r.kpis;
  // as on the page: only stations with downtime, worst first
  const down = sheets.Downtime;
  sheets.Downtime = [down[0], ...r.report.down.map((d, i) => ({ d, row: down[i + 1] })).filter((x) => x.d.down || x.d.caused).sort((a, b) => b.d.caused - a.d.caused).map((x) => x.row)];
  delete sheets.About;
  const table = (rows: Cell[][]) => rows.length > 1
    ? { table: { headerRows: 1, widths: rows[0].map((_, i) => (i === 0 ? 'auto' : '*')), body: [rows[0].map((h) => ({ text: String(h), bold: true, color: MUTED })), ...rows.slice(1).map((row) => row.map((c) => String(c)))] }, layout: { hLineColor: () => HAIR, vLineWidth: () => 0, hLineWidth: (i: number) => (i <= 1 ? 1 : 0.5), paddingTop: () => 3, paddingBottom: () => 3 }, fontSize: 8 }
    : { text: 'Nothing in this selection.', color: MUTED, fontSize: 9 };
  const kpi = (label: string, value: string) => ({ stack: [{ text: label.toUpperCase(), fontSize: 7, color: MUTED, characterSpacing: 0.5 }, { text: value, fontSize: 16, margin: [0, 2, 0, 0] }] });
  const range = meta.from === meta.to ? meta.from : `${meta.from} to ${meta.to}`;
  const doc = {
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [36, 40, 36, 44],
    info: { title: `MG GA Andon report ${range}`, author: 'MG GA Andon', subject: 'Production report (URD req 28–29)' },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: INK },
    footer: (page: number, pages: number) => ({ columns: [{ text: `Exported ${meta.exportedAt} by ${meta.by} · SIMULATION: no PLC, scanner or sensor is connected.`, color: MUTED }, { text: `Page ${page} of ${pages}`, alignment: 'right', color: MUTED }], margin: [36, 12, 36, 0], fontSize: 7 }),
    content: [
      { text: 'MG GA ANDON · REPORT', fontSize: 8, color: MUTED, characterSpacing: 1 },
      { text: `${range} · ${meta.shift} · ${meta.line}`, fontSize: 18, bold: true, margin: [0, 2, 0, 2] },
      { text: `Source: ${meta.sources}.${r.empty.length ? ` No data stored for ${r.empty.join(', ')}.` : ''}`, color: MUTED, margin: [0, 0, 0, 12] },
      { columns: [
        kpi(meta.line === 'All lines' ? 'Completed (Final)' : 'Completed', `${k.done} / ${k.target}`), kpi('Offlined', String(k.offline)), kpi('Downtime (line total)', fmtDur(k.down)),
        kpi('Assist calls', String(k.calls)), kpi('Avg response', k.avgResponse != null ? fmtDur(k.avgResponse) : '—'), kpi('Avg time to clear', k.avgClear != null ? fmtDur(k.avgClear) : '—'),
      ], margin: [0, 0, 0, 10] },
      ...Object.entries(sheets).flatMap(([name, rows]) => [{ text: name, fontSize: 12, bold: true, margin: [0, 10, 0, 4] }, table(rows)]),
    ],
  };
  return pdf().createPdf(doc).getBuffer();
}
