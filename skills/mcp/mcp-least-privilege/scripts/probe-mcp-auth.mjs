#!/usr/bin/env node
// Conformance probe for the server side of MCP authorization, spec revision 2026-07-28.
// Zero dependencies, Node 18+. Sends only unauthenticated or dummy-token requests.
// Usage: node probe-mcp-auth.mjs <url-of-the-MCP-endpoint> [--json] [--allow-http]
// Exit: 0 all checks pass, 1 a check failed, 2 the server could not be probed.
import { pathToFileURL } from 'node:url';

const SPEC = 'https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization';
const DUMMY_TOKEN = 'probe';
const TIMEOUT_MS = 10_000;

const Q = {
  status401: '401 authorization required or token invalid; 403 invalid scopes or insufficient permissions; 400 malformed request.',
  prm: 'MCP servers MUST implement OAuth 2.0 Protected Resource Metadata (RFC 9728). MCP clients MUST use it for authorization server discovery.',
  scope: 'MCP servers SHOULD include a `scope` parameter in the `WWW-Authenticate` header (RFC 6750 section 3) to indicate required scopes.',
  offline: 'Servers SHOULD NOT include `offline_access` in the WWW-Authenticate scope or in `scopes_supported`.',
  canonical: 'Resource parameter (RFC 8707): ... MUST identify the MCP server the token is for; MUST use the canonical URI of the server. ... invalid: `mcp.example.com` (no scheme), anything with a fragment. Prefer no trailing slash.',
  invalid: 'Invalid or expired tokens MUST receive HTTP 401.',
  query: 'Access tokens MUST NOT be included in the URI query string.',
};

class Unprobeable extends Error {}

function parseArgs(argv) {
  const opts = { json: false, allowHttp: false, url: null };
  for (const a of argv) {
    if (a === '--json') opts.json = true;
    else if (a === '--allow-http') opts.allowHttp = true;
    else if (a.startsWith('--')) throw new Unprobeable(`unknown flag ${a}`);
    else if (opts.url) throw new Unprobeable('pass exactly one URL');
    else opts.url = a;
  }
  if (!opts.url) throw new Unprobeable('usage: node probe-mcp-auth.mjs <url> [--json] [--allow-http]');
  return opts;
}

function checkTarget(raw, allowHttp, what) {
  let u;
  try { u = new URL(raw); } catch { throw new Unprobeable(`${what} is not a URL: ${raw}`); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Unprobeable(`${what} is not HTTP(S): ${raw}`);
  if (u.protocol === 'http:' && !allowHttp) throw new Unprobeable(`${what} uses http; pass --allow-http for a local test server`);
  if (u.username || u.password) throw new Unprobeable(`${what} carries credentials; the probe never sends credentials`);
  for (const k of u.searchParams.keys()) {
    if (/^(access_token|token|api[_-]?key|key|secret|password|code)$/i.test(k)) throw new Unprobeable(`${what} has a credential-like query parameter "${k}"; remove it`);
  }
  return u;
}

export function canonical(u) {
  const c = new URL(u);
  c.hash = '';
  return !c.search && c.href.endsWith('/') ? c.href.slice(0, -1) : c.href;
}

export function parseBearerChallenge(header) {
  if (!header) return null;
  const m = header.match(/(?:^|,)\s*Bearer(?=\s|,|$)/i);
  if (!m) return null;
  const rest = header.slice(m.index + m[0].length);
  const params = {};
  const re = /\s*,?\s*([A-Za-z_][\w-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,"]+))/y;
  let p;
  while ((p = re.exec(rest))) {
    params[p[1].toLowerCase()] = p[2] !== undefined ? p[2].replace(/\\(.)/g, '$1') : p[3];
  }
  return params;
}

const INIT_BODY = JSON.stringify({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2026-07-28', capabilities: {}, clientInfo: { name: 'probe-mcp-auth', version: '1.0.0' } },
});

async function send(url, { method = 'POST', bearer } = {}) {
  const headers = { accept: 'application/json, text/event-stream' };
  if (method === 'POST') headers['content-type'] = 'application/json';
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const res = await fetch(url, {
    method, headers, body: method === 'POST' ? INIT_BODY : undefined,
    redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text().catch(() => '');
  return { status: res.status, headers: res.headers, text };
}

export async function probe(rawUrl, { allowHttp = false } = {}) {
  const target = checkTarget(rawUrl, allowHttp, 'endpoint');
  const checks = [];
  const add = (id, status, level, detail, spec) => checks.push({ id, status, level, detail, spec });

  let first;
  try { first = await send(target.href); } catch (e) {
    throw new Unprobeable(`could not reach ${target.href}: ${e.cause?.code || e.name || e.message}`);
  }

  if (first.status === 401) add('unauth-401', 'pass', 'MUST', 'unauthenticated request got 401', Q.status401);
  else add('unauth-401', 'fail', 'MUST', `unauthenticated request got ${first.status}, expected 401 (authorization is OPTIONAL; if this server is meant to be public, this probe does not apply)`, Q.status401);

  const wwwAuth = first.headers.get('www-authenticate');
  const challenge = parseBearerChallenge(wwwAuth);
  if (challenge) add('challenge-bearer', 'pass', 'MUST', `WWW-Authenticate: ${wwwAuth}`, Q.prm);
  else add('challenge-bearer', 'fail', 'MUST', wwwAuth ? `no Bearer challenge in WWW-Authenticate: ${wwwAuth}` : 'no WWW-Authenticate header on the 401', Q.prm);

  const rmRaw = challenge?.resource_metadata;
  let rmUrl = null;
  if (!rmRaw) {
    add('challenge-resource-metadata', 'fail', 'MUST', 'Bearer challenge has no resource_metadata parameter, so a client cannot discover the protected resource metadata from the 401 (a well-known fallback is described in the authorization-server-discovery sub-page, which this probe does not verify)', Q.prm);
  } else {
    try {
      rmUrl = checkTarget(rmRaw, allowHttp, 'resource_metadata');
      add('challenge-resource-metadata', 'pass', 'MUST', `resource_metadata="${rmRaw}"`, Q.prm);
    } catch (e) {
      add('challenge-resource-metadata', 'fail', 'MUST', e.message, Q.prm);
    }
  }

  if (challenge?.scope !== undefined) {
    const scopes = challenge.scope.split(/\s+/).filter(Boolean);
    add('challenge-scope', 'pass', 'SHOULD', `scope="${challenge.scope}"`, Q.scope);
    if (scopes.includes('offline_access')) add('challenge-no-offline-access', 'fail', 'SHOULD NOT', 'challenge scope contains offline_access', Q.offline);
  } else if (challenge) {
    add('challenge-scope', 'info', 'SHOULD', 'challenge carries no scope parameter; clients will fall back to scopes_supported', Q.scope);
  }

  let meta = null;
  if (rmUrl) {
    try {
      const r = await send(rmUrl.href, { method: 'GET' });
      if (r.status !== 200) throw new Error(`metadata URL returned ${r.status}`);
      meta = JSON.parse(r.text);
      if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw new Error('metadata is not a JSON object');
      add('metadata-json', 'pass', 'MUST', `fetched ${rmUrl.href}`, Q.prm);
    } catch (e) {
      meta = null;
      const why = e instanceof SyntaxError ? 'metadata is not JSON' : e.cause?.code || e.message;
      add('metadata-json', 'fail', 'MUST', `${rmUrl.href}: ${why}`, Q.prm);
    }
  } else {
    add('metadata-json', 'skip', 'MUST', 'no usable resource_metadata URL', Q.prm);
  }

  if (meta) {
    const res = meta.resource;
    let ru = null;
    if (typeof res !== 'string' || !res) {
      add('metadata-resource', 'fail', 'MUST', 'metadata has no "resource" string', Q.prm);
    } else {
      try { ru = new URL(res); } catch { /* reported below */ }
      if (!ru || (ru.protocol !== 'https:' && ru.protocol !== 'http:')) add('metadata-resource', 'fail', 'MUST', `resource "${res}" is not an absolute http(s) URI`, Q.canonical);
      else add('metadata-resource', 'pass', 'MUST', `resource="${res}"`, Q.prm);
    }
    if (ru) {
      if (res.includes('#')) add('resource-no-fragment', 'fail', 'MUST', `resource "${res}" has a fragment`, Q.canonical);
      else add('resource-no-fragment', 'pass', 'MUST', 'no fragment', Q.canonical);
      const want = canonical(target);
      const got = canonical(ru);
      const slashNote = ru.pathname !== '/' && ru.pathname.endsWith('/') ? '; prefer no trailing slash' : '';
      if (got === want) add('resource-matches-endpoint', 'pass', 'MUST', `resource matches ${want}${slashNote}`, Q.canonical);
      else if (want.startsWith(got + '/')) add('resource-matches-endpoint', 'pass', 'MUST', `resource ${got} is a path prefix of ${want}; the spec lists both an origin and a path as canonical forms${slashNote}`, Q.canonical);
      else add('resource-matches-endpoint', 'fail', 'MUST', `resource ${got} does not identify the probed endpoint ${want}`, Q.canonical);
    }

    const as = meta.authorization_servers;
    if (!Array.isArray(as) || as.length === 0) {
      add('authorization-servers', 'fail', 'MUST', 'authorization_servers is missing or empty, so clients have no authorization server to discover', Q.prm);
    } else {
      const bad = as.filter((s) => { try { return new URL(s).protocol !== 'https:'; } catch { return true; } });
      if (bad.length) add('authorization-servers', 'fail', 'MUST', `not https URLs: ${bad.map(String).join(', ')} (https is the probe's bar; the digest gives no separate keyword for it)`, Q.prm);
      else add('authorization-servers', 'pass', 'MUST', as.join(', '), Q.prm);
    }

    const ss = meta.scopes_supported;
    if (ss === undefined) add('scopes-supported-no-offline-access', 'info', 'SHOULD NOT', 'no scopes_supported; clients omit scope unless the challenge names one', Q.offline);
    else if (!Array.isArray(ss)) add('scopes-supported-no-offline-access', 'fail', 'SHOULD NOT', 'scopes_supported is not an array', Q.offline);
    else if (ss.includes('offline_access')) add('scopes-supported-no-offline-access', 'fail', 'SHOULD NOT', 'scopes_supported contains offline_access; it is meant to be the minimal set for basic functionality', Q.offline);
    else add('scopes-supported-no-offline-access', 'pass', 'SHOULD NOT', `scopes_supported=${JSON.stringify(ss)}`, Q.offline);
  }

  try {
    const r = await send(target.href, { bearer: DUMMY_TOKEN });
    if (r.status === 401) add('invalid-bearer-401', 'pass', 'MUST', 'dummy Bearer token got 401', Q.invalid);
    else add('invalid-bearer-401', 'fail', 'MUST', `dummy Bearer token got ${r.status}, expected 401`, Q.invalid);
  } catch (e) {
    add('invalid-bearer-401', 'fail', 'MUST', `request failed: ${e.cause?.code || e.message}`, Q.invalid);
  }

  const qUrl = new URL(target.href);
  qUrl.searchParams.set('access_token', DUMMY_TOKEN);
  try {
    const r = await send(qUrl.href);
    if (r.status === 401) add('query-token-rejected', 'pass', 'MUST NOT', 'token in query string got 401', `${Q.query} ${Q.invalid}`);
    else add('query-token-rejected', 'fail', 'MUST NOT', `token in query string got ${r.status}, expected 401`, `${Q.query} ${Q.invalid}`);
  } catch (e) {
    add('query-token-rejected', 'fail', 'MUST NOT', `request failed: ${e.cause?.code || e.message}`, Q.query);
  }

  return { url: target.href, spec: SPEC, checks, ok: !checks.some((c) => c.status === 'fail') };
}

function render(report) {
  const lines = [`probe-mcp-auth ${report.url}`, `spec ${report.spec}`, ''];
  for (const c of report.checks) {
    lines.push(`${c.status.toUpperCase().padEnd(4)}  ${c.id}  [${c.level}]  ${c.detail}`);
    if (c.status === 'fail') lines.push(`      spec: ${c.spec}`);
  }
  const failed = report.checks.filter((c) => c.status === 'fail').length;
  lines.push('', failed ? `RESULT: FAIL (${failed} check(s))` : 'RESULT: PASS');
  lines.push('Not tested: token passthrough, audience validation of a real token, 403 insufficient_scope step-up.');
  return lines.join('\n');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
    const report = await probe(opts.url, { allowHttp: opts.allowHttp });
    console.log(opts.json ? JSON.stringify({ ...report, exit: report.ok ? 0 : 1 }, null, 2) : render(report));
    process.exitCode = report.ok ? 0 : 1;
  } catch (e) {
    if (!(e instanceof Unprobeable)) throw e;
    if (opts?.json) console.log(JSON.stringify({ url: opts.url, error: e.message, exit: 2 }, null, 2));
    else console.error(`UNPROBEABLE: ${e.message}`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
