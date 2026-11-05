/* Single sign-on with the company directory (OpenID Connect: Microsoft Entra ID, Google, Keycloak …).
   Authorization code flow with PKCE, state and nonce. The person is matched by email to an active
   account here, which keeps its role; people without an account are refused (and logged).
   Off unless OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and OIDC_REDIRECT_URI are set. */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import * as oidc from 'openid-client';
import type { Db } from '../db/index.ts';
import { logAuth, setSessionCookie } from './routes.ts';
import type { Sessions, UserRow } from './sessions.ts';

export interface OidcSettings { issuer: string; clientId: string; clientSecret: string; redirectUri: string; label?: string; allowHttp?: boolean }

export function oidcFromEnv(env: NodeJS.ProcessEnv): OidcSettings | null {
  const { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId, OIDC_CLIENT_SECRET: clientSecret, OIDC_REDIRECT_URI: redirectUri } = env;
  if (!issuer || !clientId || !clientSecret || !redirectUri) return null;
  return { issuer, clientId, clientSecret, redirectUri, label: env.OIDC_LABEL || 'MG JW account', allowHttp: env.OIDC_ALLOW_HTTP === '1' };
}

const FLOW_COOKIE = 'mg_oidc', FLOW_MS = 10 * 60_000;

export async function registerOidc(app: FastifyInstance, db: Db, sessions: Sessions, s: OidcSettings) {
  let config: oidc.Configuration | null = null;
  const load = async () => (config ??= await oidc.discovery(new URL(s.issuer), s.clientId, s.clientSecret, undefined, s.allowHttp ? { execute: [oidc.allowInsecureRequests] } : undefined));
  const flows = new Map<string, { verifier: string; state: string; nonce: string; at: number }>();
  const back = (reason: string) => `/?sso_error=${encodeURIComponent(reason)}`;

  app.get('/api/auth/oidc/start', async (req, reply) => {
    const c = await load();
    const id = randomBytes(18).toString('base64url'), verifier = oidc.randomPKCECodeVerifier(), state = oidc.randomState(), nonce = oidc.randomNonce();
    for (const [k, f] of flows) if (Date.now() - f.at > FLOW_MS) flows.delete(k);
    flows.set(id, { verifier, state, nonce, at: Date.now() });
    // Lax, not Strict: the identity provider sends the browser back here from another site
    reply.setCookie(FLOW_COOKIE, id, { path: '/api/auth/oidc', httpOnly: true, sameSite: 'lax', secure: req.protocol === 'https', maxAge: FLOW_MS / 1000 });
    const url = oidc.buildAuthorizationUrl(c, { redirect_uri: s.redirectUri, scope: 'openid email profile', code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', state, nonce });
    return reply.redirect(url.href);
  });

  app.get('/api/auth/oidc/callback', async (req, reply) => {
    const id = req.cookies[FLOW_COOKIE], flow = id ? flows.get(id) : undefined;
    if (id) flows.delete(id);
    reply.clearCookie(FLOW_COOKIE, { path: '/api/auth/oidc' });
    if (!flow || Date.now() - flow.at > FLOW_MS) return reply.redirect(back('expired'));
    let email: string;
    try {
      const c = await load();
      const here = new URL(req.url, s.redirectUri);
      const tokens = await oidc.authorizationCodeGrant(c, here, { pkceCodeVerifier: flow.verifier, expectedState: flow.state, expectedNonce: flow.nonce });
      const claims = (tokens.claims() || {}) as Record<string, unknown>;
      email = String(claims.email || claims.preferred_username || claims.upn || '').trim().toLowerCase();
    } catch (e) {
      await logAuth(db, 'single sign-on', 'Sign-in failed', `SSO: ${(e as Error).message}`.slice(0, 200), req.ip);
      return reply.redirect(back('failed'));
    }
    const u = email ? await db.one<UserRow>('SELECT * FROM users WHERE lower(email) = $1', [email]) : null;
    if (!u || !u.active) {
      await logAuth(db, email || 'single sign-on', 'Sign-in failed', u ? 'SSO: account disabled' : 'SSO: no account for this email', req.ip);
      return reply.redirect(back(u ? 'disabled' : 'no-account'));
    }
    const { token, expiresAt } = await sessions.create({ kind: 'user', userId: u.id, keep: false, ip: req.ip, ua: req.headers['user-agent'] });
    await db.query('UPDATE users SET last_sign_in = now() WHERE id = $1', [u.id]);
    await logAuth(db, u.name, 'Signed in', 'single sign-on', req.ip);
    setSessionCookie(req, reply, token, expiresAt);
    return reply.redirect('/');
  });
}
