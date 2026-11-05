/* ── vehicles & VINs ───────────────────────────────────────────────────── */
import { PAINTS, VARIANTS, hash01, uid, vinCheckDigit } from '@mg/core';

function pickVariant(serial, seed) { const u = hash01('variant' + serial + seed); let acc = 0; for (const v of VARIANTS) { acc += v.share; if (u < acc) return v; } return VARIANTS[0]; }
export function makeVin(S) {
  const serial = S.vinSerial++, variant = pickVariant(serial, S.seed);
  const body = 'LSJ' + variant.vds + '0' + 'T' + 'P' + String(serial).padStart(6, '0');
  return { vin: body.slice(0, 8) + vinCheckDigit(body) + body.slice(9), variant };
}

/* ── paint-shop feed into the body buffer ── */
export function feedBuffer(S) {
  const free = S.bodyBuffer.findIndex((b) => !b); if (free < 0) return false;
  const { vin, variant } = makeVin(S);
  const paint = PAINTS[Math.floor(hash01(vin + 'paint') * PAINTS.length)];
  S.bodyBuffer[free] = { id: uid(S, 'b'), label: vin, variant, paint, t: S.t };
  return true;
}
