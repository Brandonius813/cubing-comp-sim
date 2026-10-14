import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';

const release = 'eb1916b9bfea4c2479436d7e10bec33bd28a570c';
const script = new URL('render-api.mjs', import.meta.url).pathname;
const manifests = new URL('environments/', import.meta.url).pathname;
function render(manifest, target) {
  return execFileSync(process.execPath, [script, manifest, `ccs-api:${release}`, release, target], { encoding: 'utf8', timeout: 10000, stdio: 'pipe' });
}

test('shared host renders one proxy, distinct fixed API routes and boot ordering', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ccs-gateway-test-'));
  try {
    const prod = resolve(root, 'production');
    const stage = resolve(root, 'staging');
    render(resolve(manifests, 'production.json'), prod);
    render(resolve(manifests, 'staging.json'), stage);
    const [production, staging, caddy] = await Promise.all([
      readFile(resolve(prod, 'compose.yaml'), 'utf8'), readFile(resolve(stage, 'compose.yaml'), 'utf8'), readFile(resolve(prod, 'Caddyfile'), 'utf8')
    ]);
    assert.equal((production.match(/^  proxy:/gm) ?? []).length, 1);
    assert.doesNotMatch(staging, /^  proxy:|"80:80"|"443:443"/m);
    assert.match(production, /peer:\n    external: true\n    name: ccs-staging_backend/);
    assert.match(production, /peer:\n        ipv4_address: 172\.28\.53\.2/);
    assert.match(caddy, /api\.cubingcompsim\.com \{[\s\S]*?reverse_proxy 172\.28\.54\.3:3001/);
    assert.match(caddy, /api-staging\.cubingcompsim\.com \{[\s\S]*?reverse_proxy 172\.28\.53\.3:3001/);
    assert.doesNotMatch(caddy, /reverse_proxy api:/);
    assert.equal(await readFile(resolve(prod, 'systemd/ccs-production.service.d/10-shared-gateway.conf'), 'utf8'), '[Unit]\nWants=ccs-staging.service\nAfter=ccs-staging.service\n');
    for (const [output, service] of [[prod, 'ccs-production'], [stage, 'ccs-staging']]) {
      for (const suffix of ['cleanup', 'cleanup-accounts']) {
        assert.equal(await readFile(resolve(output, `systemd/${service}-${suffix}.service.d/10-shared-gateway.conf`), 'utf8'), '[Unit]\nRequires=ccs-production.service\nAfter=ccs-production.service\n');
      }
    }
    assert.doesNotMatch(production + staging + caddy, /@@/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('standalone manifest still renders its own proxy; invalid shared owner is rejected', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'ccs-gateway-test-'));
  try {
    const c = JSON.parse(await readFile(resolve(manifests, 'production.json'), 'utf8'));
    delete c.gateway;
    const manifest = resolve(root, 'production.json');
    await writeFile(manifest, JSON.stringify(c));
    render(manifest, resolve(root, 'standalone'));
    assert.match(await readFile(resolve(root, 'standalone/compose.yaml'), 'utf8'), /^  proxy:/m);
    const peer = JSON.parse(await readFile(resolve(manifests, 'staging.json'), 'utf8'));
    peer.gateway.ownerService = 'wrong-owner';
    await writeFile(resolve(root, 'staging.json'), JSON.stringify(peer));
    c.gateway = { role: 'shared', peerManifest: 'staging.json' };
    await writeFile(manifest, JSON.stringify(c));
    assert.throws(() => render(manifest, resolve(root, 'invalid')), /Shared gateway peer must name this owner/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
