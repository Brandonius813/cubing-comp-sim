import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';

const [manifestPath, image, release, directory] = process.argv.slice(2);
if (!manifestPath || !image || !release || !directory) throw new Error('Supply environment manifest, tested API image, release SHA and output directory.');
if (!/^[a-f0-9]{40}$/.test(release) || !/^[a-z0-9][a-z0-9./:_@-]+$/.test(image)) throw new Error('Use an explicit tested release and image.');
function validate(c) {
  if (c.schemaVersion !== 1 || !['staging', 'production'].includes(c.environment)) throw new Error('Invalid environment.');
  for (const name of ['serviceName', 'databaseRole', 'databaseSchema', 'bucket', 'workerName']) {
    if (!/^[a-z][a-z0-9_-]*$/.test(c[name] ?? '')) throw new Error('Invalid environment resource name.');
  }
  for (const name of ['appUrl', 'apiUrl', 'supabaseUrl']) {
    const url = new URL(c[name]);
    if (url.protocol !== 'https:' || url.origin !== c[name]) throw new Error('Use exact HTTPS origins.');
  }
  if (![c.proxyIp, c.apiIp].every(value => isIP(value) === 4) || c.proxyIp === c.apiIp || !/^\d+\.\d+\.\d+\.0\/24$/.test(c.networkSubnet)) throw new Error('Use separate fixed proxy/API addresses in a dedicated /24 network.');
  const prefix = c.networkSubnet.split('.').slice(0, 3).join('.') + '.';
  if (![c.proxyIp, c.apiIp].every(value => value.startsWith(prefix))) throw new Error('Proxy/API addresses must belong to the selected network.');
  if (!/^\/[a-zA-Z0-9/_-]+$/.test(c.privateDirectory)) throw new Error('Use an absolute private-directory path without shell metacharacters.');
  if (!['standalone', 'shared', 'external'].includes(c.gateway?.role ?? 'standalone')) throw new Error('Invalid gateway role.');
  if (c.gateway?.role === 'external' && !/^[a-z][a-z0-9_-]*$/.test(c.gateway.ownerService ?? '')) throw new Error('External gateway requires its owner service.');
  return c;
}
const c = validate(JSON.parse(await readFile(manifestPath, 'utf8')));
const role = c.gateway?.role ?? 'standalone';
let peer;
if (role === 'shared') {
  if (!/^[a-z0-9_-]+\.json$/.test(c.gateway.peerManifest ?? '')) throw new Error('Shared gateway requires a sibling peer manifest.');
  peer = validate(JSON.parse(await readFile(resolve(dirname(manifestPath), c.gateway.peerManifest), 'utf8')));
  if (peer.gateway?.role !== 'external' || peer.gateway.ownerService !== c.serviceName || peer.serviceName === c.serviceName || peer.environment === c.environment || peer.networkSubnet === c.networkSubnet || peer.apiUrl === c.apiUrl) throw new Error('Shared gateway peer must name this owner and use a separate environment, network and host.');
}
const replacements = { SERVICE: c.serviceName, API_IMAGE: image, RELEASE: release, PRIVATE_DIR: c.privateDirectory,
  PROXY_IP: c.proxyIp, API_IP: c.apiIp, SUBNET: c.networkSubnet, API_HOST: new URL(c.apiUrl).hostname,
  PEER_ATTACHMENT: peer ? `      peer:\n        ipv4_address: ${peer.proxyIp}\n` : '',
  PEER_NETWORK: peer ? `  peer:\n    external: true\n    name: ${peer.serviceName}_backend\n` : '',
  PROXY_VOLUMES: role === 'external' ? '' : 'volumes:\n  caddy_data:\n  caddy_config:\n' };
function render(source, values = replacements) {
  return source.replace(/@@([A-Z_]+)@@/g, (_, key) => {
    if (!(key in values)) throw new Error('Unknown template parameter.');
    return values[key];
  });
}
replacements.PROXY_SERVICE = role === 'external' ? '' : render(await readFile(new URL('compose-proxy.template.yaml', import.meta.url), 'utf8'));
const site = await readFile(new URL('Caddy-site.template', import.meta.url), 'utf8');
replacements.API_HOSTS = render(site) + (peer ? render(site, { API_HOST: new URL(peer.apiUrl).hostname, API_IP: peer.apiIp }) : '');
await mkdir(directory, { recursive: true });
await writeFile(resolve(directory, 'compose.yaml'), render(await readFile(new URL('compose.template.yaml', import.meta.url), 'utf8')));
await writeFile(resolve(directory, 'Caddyfile'), role === 'external' ? `# HTTPS is managed by ${c.gateway.ownerService}; this environment has no proxy.\n` : render(await readFile(new URL('Caddyfile.template', import.meta.url), 'utf8')));
async function dropIn(unit, content) {
  const target = resolve(directory, 'systemd', `${unit}.service.d`);
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, '10-shared-gateway.conf'), '[Unit]\n' + content);
}
if (peer) await dropIn(c.serviceName, `Wants=${peer.serviceName}.service\nAfter=${peer.serviceName}.service\n`);
if (role !== 'standalone') {
  const owner = role === 'shared' ? c.serviceName : c.gateway.ownerService;
  for (const suffix of ['cleanup', 'cleanup-accounts']) {
    await dropIn(`${c.serviceName}-${suffix}`, `Requires=${owner}.service\nAfter=${owner}.service\n`);
  }
}
await writeFile(resolve(directory, 'environment.json'), JSON.stringify(c, null, 2) + '\n');
await writeFile(resolve(directory, 'release.json'), JSON.stringify({ schemaVersion: 1, environment: c.environment, image, sourceCommit: release }, null, 2) + '\n');
console.log('Rendered API/HTTPS configuration and required gateway ordering. This does not install or activate services.');
