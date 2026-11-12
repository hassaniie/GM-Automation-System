/* Spreadsheet-safe exports (audit B13): a cell that starts with = + - @ or a control character is prefixed with an
   apostrophe so a spreadsheet shows it as text instead of running it, and CSV files start with a byte-order mark so
   Excel reads them as UTF-8 (arrows and accents survive). */
export const safeCell = (c) => (typeof c === 'string' && /^[=+\-@\t\r]/.test(c) ? `'${c}` : c);
/** Rows (arrays) → CSV text with a byte-order mark. */
export const toCsv = (rows) => '﻿' + rows.map((r) => r.map((c) => `"${String(c == null ? '' : safeCell(c)).replace(/"/g, '""')}"`).join(',')).join('\r\n');
