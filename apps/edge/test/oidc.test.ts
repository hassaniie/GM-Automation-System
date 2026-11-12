/* Single sign-on against a mock OpenID Connect provider (discovery, JWKS, token endpoint with PKCE),
   all in this test. Proves: known email → session; unknown email and tampered state → refused. */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { buildServer } from '../src/server.ts';
import { dbAvailable, freshDatabase } from './helpers/db.ts';

const CLIENT_ID = 'andon', CLIENT_SECRET = 'secret';
let idp: Server, issuer = '';
const codes = new Map<string, { nonce: string; challenge: string; email: string }>();
let T: Awaited<ReturnType<typeof freshDatabase>>, srv: Awaited<ReturnType<typeof buildServer>>, base = '';

const NO_DB = !(await dbAvailable());
beforeEach((c) => { if (NO_DB) c.skip(); });
beforeAll(async () => {
  if (NO_DB) return;
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  idp = createServer(async (req, res) => {
    const url = new URL(req.url!, issuer), json = (o: unknown, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (url.pathname === '/.well-known/openid-configuration') return json({
      issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    });
    if (url.pathname === '/jwks') return json({ keys: [jwk] });
    if (url.pathname === '/token') {
      let body = ''; for await (const c of req) body += c;
      const f = new URLSearchParams(body);
      const auth = req.headers.authorization ? Buffer.from(req.headers.authorization.replace('Basic ', ''), 'base64').toString() : `${f.get('client_id')}:${f.get('client_secret')}`;
      const c = codes.get(f.get('code') || '');
      if (auth !== `${CLIENT_ID}:${CLIENT_SECRET}` || !c) return json({ error: 'invalid_grant' }, 400);
      if (createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') !== c.challenge) return json({ error: 'invalid_grant', error_description: 'PKCE' }, 400);
      const id_token = await new SignJWT({ email: c.email, nonce: c.nonce }).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
        .setIssuer(issuer).setAudience(CLIENT_ID).setSubject(c.email).setIssuedAt().setExpirationTime('5m').sign(privateKey);
      return json({ access_token: 'at', token_type: 'Bearer', expires_in: 300, id_token });
    }
    res.writeHead(404); res.end();
  });
  await new Promise<void>((r) => idp.listen(0, '127.0.0.1', () => r()));
  issuer = `http://127.0.0.1:${(idp.address() as { port: number }).port}`;
  T = await freshDatabase();
  srv = await buildServer({ webDir: null, databaseUrl: T.url, demo: true, tickMs: 100,
    sso: { issuer, clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, redirectUri: 'http://andon.test/api/auth/oidc/callback', label: 'MG JW account', allowHttp: true } });
  await srv.app.listen({ port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${(srv.app.server.address() as { port: number }).port}`;
});
afterAll(async () => { await srv?.app.close(); await T?.drop(); idp?.close(); });

/** Starts sign-in, plays the provider's part for `email`, and returns the callback response. */
async function ssoAs(email: string, tamperState = false) {
  const start = await fetch(`${base}/api/auth/oidc/start`, { redirect: 'manual' });
  expect(start.status).toBe(302);
  const to = new URL(start.headers.get('location')!);
  expect(to.origin + to.pathname).toBe(`${issuer}/authorize`);
  expect(to.searchParams.get('code_challenge_method')).toBe('S256');
  const flow = start.headers.get('set-cookie')!.split(';')[0];
  const code = randomBytes(12).toString('hex');
  codes.set(code, { nonce: to.searchParams.get('nonce')!, challenge: to.searchParams.get('code_challenge')!, email });
  const state = tamperState ? 'not-the-state' : to.searchParams.get('state')!;
  return fetch(`${base}/api/auth/oidc/callback?code=${code}&state=${encodeURIComponent(state)}`, { redirect: 'manual', headers: { cookie: flow } });
}

test('the sign-in screen is told SSO is available', async () => {
  const cfg = await (await fetch(`${base}/api/auth/config`)).json();
  expect(cfg.sso).toEqual({ label: 'MG JW account' });
});

test('a person with an account signs in through the company directory and keeps their role', async () => {
  const r = await ssoAs('Usman.Tariq@mgjw.pk');
  expect(r.status).toBe(302);
  expect(r.headers.get('location')).toBe('/');
  const cookie = r.headers.getSetCookie().map((c) => c.split(';')[0]).find((c) => c.startsWith('mg_session='))!;
  expect(cookie).toMatch(/^mg_session=/);
  const me = await (await fetch(`${base}/api/auth/me`, { headers: { cookie } })).json();
  expect(me.me.user.name).toBe('Usman Tariq');
  expect(me.me.user.role).toBe('supervisor');
});

test('people without an account, and tampered requests, are refused and logged', async () => {
  const stranger = await ssoAs('someone@elsewhere.com');
  expect(stranger.headers.get('location')).toBe('/?sso_error=no-account');
  expect(stranger.headers.getSetCookie().join(' ')).not.toMatch(/mg_session=/);
  const tampered = await ssoAs('usman.tariq@mgjw.pk', true);
  expect(tampered.headers.get('location')).toBe('/?sso_error=failed');
  const noFlow = await fetch(`${base}/api/auth/oidc/callback?code=x&state=y`, { redirect: 'manual' });
  expect(noFlow.headers.get('location')).toBe('/?sso_error=expired');
  const log = await T.db.query<{ detail: string }>("SELECT detail FROM auth_log WHERE action = 'Sign-in failed'");
  expect(log.map((l) => l.detail)).toEqual(expect.arrayContaining(['SSO: no account for this email', expect.stringMatching(/^SSO: /)]));
});
