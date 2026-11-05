/* Calls to the edge server's REST API (same origin, session cookie). State-changing calls carry the
   X-MG-Client header the server requires (it blocks cross-site requests). Never throws for HTTP errors:
   returns { status, ok, ...body }. */
export async function api(path, { method, body } = {}) {
  const m = method || (body === undefined ? 'GET' : 'POST');
  try {
    const r = await fetch(path, {
      method: m, credentials: 'same-origin',
      headers: { 'x-mg-client': 'web', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* empty body */ }
    return { ...data, status: r.status, ok: r.ok && data.ok !== false };
  } catch (e) {
    return { status: 0, ok: false, error: 'The line server is not reachable.' };
  }
}
