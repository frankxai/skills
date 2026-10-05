// Run: node --test (from this folder). Mock servers bind 127.0.0.1 on an ephemeral port.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseBearerChallenge, canonical } from './probe-mcp-auth.mjs';

const PROBE = fileURLToPath(new URL('./probe-mcp-auth.mjs', import.meta.url));
const PRM_PATH = '/.well-known/oauth-protected-resource/mcp';

function startMock(overrides = {}) {
  const server = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const u = new URL(req.url, base);
    if (u.pathname === (overrides.metadataPath ?? PRM_PATH) && !overrides.metadataMissing) {
      if (overrides.metadataBody !== undefined) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(overrides.metadataBody);
      }
      const meta = {
        resource: `${base}/mcp`,
        authorization_servers: ['https://auth.example.com'],
        scopes_supported: ['files:read'],
        ...(overrides.metadata ? overrides.metadata(base) : {}),
      };
      for (const k of Object.keys(meta)) if (meta[k] === undefined) delete meta[k];
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(meta));
    }
    if (u.pathname !== '/mcp') { res.writeHead(404); return res.end(); }
    req.resume();
    const hasQueryToken = u.searchParams.has('access_token');
    const hasBearer = /^Bearer\s/i.test(req.headers.authorization || '');
    if (hasQueryToken && overrides.queryStatus) {
      res.writeHead(overrides.queryStatus);
      return res.end();
    }
    const accept =
      (overrides.acceptNoAuth && !hasQueryToken && !hasBearer) ||
      (overrides.acceptQueryToken && hasQueryToken) ||
      (overrides.acceptAnyBearer && hasBearer);
    if (accept) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end('{"jsonrpc":"2.0","id":1,"result":{}}');
    }
    const challenge = overrides.challenge
      ? overrides.challenge(base)
      : `Bearer resource_metadata="${base}${PRM_PATH}", scope="files:read"`;
    res.writeHead(401, challenge === null ? {} : { 'www-authenticate': challenge });
    res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function runProbe(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [PROBE, ...args], { timeout: 30_000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, out: stdout + stderr });
    });
  });
}

async function probeMock(overrides, extra = []) {
  const server = await startMock(overrides);
  try {
    return await runProbe([`http://127.0.0.1:${server.address().port}/mcp`, '--allow-http', ...extra]);
  } finally {
    server.close();
  }
}

function assertFails(r, checkId) {
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, new RegExp(`^FAIL\\s+${checkId}\\b`, 'm'), r.out);
}

test('conformant server passes every check', async () => {
  const r = await probeMock({});
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /^FAIL/m);
  assert.match(r.out, /RESULT: PASS/);
});

test('--json reports structured checks', async () => {
  const r = await probeMock({}, ['--json']);
  assert.equal(r.code, 0, r.out);
  const report = JSON.parse(r.out);
  assert.equal(report.exit, 0);
  assert.ok(report.checks.find((c) => c.id === 'query-token-rejected' && c.status === 'pass'));
});

test('200 without auth fails unauth-401', async () => {
  assertFails(await probeMock({ acceptNoAuth: true }), 'unauth-401');
});

test('401 without a WWW-Authenticate header fails challenge-bearer', async () => {
  assertFails(await probeMock({ challenge: () => null }), 'challenge-bearer');
});

test('401 without resource_metadata discovers path well-known metadata', async () => {
  const r = await probeMock({ challenge: () => 'Bearer scope="files:read"' });
  assert.equal(r.code, 0, r.out);
});

test('well-known discovery falls back from endpoint path to origin root', async () => {
  const r = await probeMock({ challenge: () => 'Bearer scope="files:read"', metadataPath: '/.well-known/oauth-protected-resource' });
  assert.equal(r.code, 0, r.out);
});

test('missing header metadata and both well-known locations fails metadata-json', async () => {
  assertFails(await probeMock({ challenge: () => 'Bearer scope="files:read"', metadataMissing: true }), 'metadata-json');
});

test('a server may reject a query token as malformed with 400', async () => {
  const r = await probeMock({ queryStatus: 400 });
  assert.equal(r.code, 0, r.out);
});

test('metadata missing resource fails metadata-resource', async () => {
  assertFails(await probeMock({ metadata: () => ({ resource: undefined }) }), 'metadata-resource');
});

test('resource with a fragment fails resource-no-fragment', async () => {
  assertFails(await probeMock({ metadata: (b) => ({ resource: `${b}/mcp#frag` }) }), 'resource-no-fragment');
});

test('resource naming another server fails resource-matches-endpoint', async () => {
  assertFails(await probeMock({ metadata: () => ({ resource: 'https://other.example.com/mcp' }) }), 'resource-matches-endpoint');
});

test('empty authorization_servers fails authorization-servers', async () => {
  assertFails(await probeMock({ metadata: () => ({ authorization_servers: [] }) }), 'authorization-servers');
});

test('scopes_supported containing offline_access fails', async () => {
  assertFails(
    await probeMock({ metadata: () => ({ scopes_supported: ['files:read', 'offline_access'] }) }),
    'scopes-supported-no-offline-access',
  );
});

test('challenge scope containing offline_access fails', async () => {
  const challenge = (b) => `Bearer resource_metadata="${b}${PRM_PATH}", scope="files:read offline_access"`;
  assertFails(await probeMock({ challenge }), 'challenge-no-offline-access');
});

test('token in the query string accepted fails query-token-rejected', async () => {
  assertFails(await probeMock({ acceptQueryToken: true }), 'query-token-rejected');
});

test('dummy Bearer token accepted fails invalid-bearer-401', async () => {
  assertFails(await probeMock({ acceptAnyBearer: true }), 'invalid-bearer-401');
});

test('metadata that is not JSON fails metadata-json', async () => {
  const r = await probeMock({ metadataBody: '<html>not json</html>' });
  assertFails(r, 'metadata-json');
  assert.match(r.out, /not JSON/);
});

test('server down exits 2', async () => {
  const server = await startMock({});
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  const r = await runProbe([`http://127.0.0.1:${port}/mcp`, '--allow-http']);
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /UNPROBEABLE: could not reach/);
});

test('refuses http without --allow-http, credentials in the URL, and non-HTTP schemes', async () => {
  for (const url of ['http://127.0.0.1:1/mcp', 'https://user:pw@mcp.example.com/mcp', 'https://mcp.example.com/mcp?access_token=x', 'ftp://mcp.example.com/']) {
    const r = await runProbe([url]);
    assert.equal(r.code, 2, `${url}\n${r.out}`);
    assert.match(r.out, /UNPROBEABLE/);
  }
});

test('challenge parser and canonical form', () => {
  assert.deepEqual(
    parseBearerChallenge('Bearer resource_metadata="https://a/x", scope="r w", Basic realm="b"'),
    { resource_metadata: 'https://a/x', scope: 'r w' },
  );
  assert.equal(parseBearerChallenge('Basic realm="x"'), null);
  assert.equal(canonical(new URL('HTTPS://MCP.Example.com:443/mcp/')), 'https://mcp.example.com/mcp');
  assert.equal(canonical(new URL('https://mcp.example.com/')), 'https://mcp.example.com');
});
