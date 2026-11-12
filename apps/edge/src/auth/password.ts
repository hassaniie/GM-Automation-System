/* Password hashing with scrypt (node:crypto). Stored as scrypt$N$r$p$salt$hash (base64). */
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const scrypt = (pw: string, salt: Buffer, len: number, o: ScryptOptions) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, o, (e, k) => (e ? rej(e) : res(k))));
const N = 1 << 15, R = 8, P = 1, LEN = 32, MAXMEM = 64 * 1024 * 1024;

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, LEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) { await hashPassword(pw); return false; } // same time either way
  const [kind, n, r, p, salt, hash] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const want = Buffer.from(hash, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length, { N: +n, r: +r, p: +p, maxmem: MAXMEM });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** At least 8 characters with a letter and a digit: one rule for the screens and the server. */
export { passwordProblem } from '@mg/contracts';
