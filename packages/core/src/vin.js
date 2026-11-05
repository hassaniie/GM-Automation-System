/* VIN: ISO 3779 structure with the North-American check digit (position 9). */
const VIN_TRANSLIT = { A:1,B:2,C:3,D:4,E:5,F:6,G:7,H:8,J:1,K:2,L:3,M:4,N:5,P:7,R:9,S:2,T:3,U:4,V:5,W:6,X:7,Y:8,Z:9 };
const VIN_WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2];
export function vinCheckDigit(vin) {
  let sum = 0;
  for (let i = 0; i < 17; i++) { const c = vin[i]; const v = /[0-9]/.test(c) ? +c : VIN_TRANSLIT[c]; sum += (v || 0) * VIN_WEIGHTS[i]; }
  const r = sum % 11; return r === 10 ? 'X' : String(r);
}
export function validateVinFormat(raw) {
  const vin = (raw || '').trim().toUpperCase();
  if (vin.length !== 17) return { ok: false, vin, reason: `A VIN has 17 characters; this one has ${vin.length}.` };
  if (/[IOQ]/.test(vin)) return { ok: false, vin, reason: 'VINs never contain I, O or Q. Check for a misread 1 or 0.' };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { ok: false, vin, reason: 'Only A–Z (except I, O, Q) and 0–9 are valid VIN characters.' };
  const cd = vinCheckDigit(vin);
  if (vin[8] !== cd) return { ok: false, vin, reason: `Check digit mismatch: position 9 reads “${vin[8]}”, expected “${cd}”. Rescan the label.` };
  return { ok: true, vin };
}
