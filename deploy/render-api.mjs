import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';

const [manifestPath, image, release, directory] = process.argv.slice(2);
if (!manifestPath || !image || !release || !directory) throw new Error('Supply environment manifest, tested API image, release SHA and output directory.');
const c = JSON.parse(await readFile(manifestPath, 'utf8'));
if (c.schemaVersion !== 1 || !['staging', 'production'].includes(c.environment)) throw new Error('Invalid environment.');
if (!/^[a-f0-9]{40}$/.test(release) || !/^[a-z0-9][a-z0-9./:_@-]+$/.test(image)) throw new Error('Use an explicit tested release and image.');
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
const replacements = { SERVICE: c.serviceName, API_IMAGE: image, RELEASE: release, PRIVATE_DIR: c.privateDirectory,
  PROXY_IP: c.proxyIp, API_IP: c.apiIp, SUBNET: c.networkSubnet, API_HOST: new URL(c.apiUrl).hostname };
await mkdir(directory, { recursive: true });
for (const [input, output] of [['compose.template.yaml', 'compose.yaml'], ['Caddyfile.template', 'Caddyfile']]) {
  const source = await readFile(new URL(input, import.meta.url), 'utf8');
  const rendered = source.replace(/@@([A-Z_]+)@@/g, (_, key) => {
    if (!(key in replacements)) throw new Error('Unknown template parameter.');
    return replacements[key];
  });
  await writeFile(resolve(directory, output), rendered);
}
await writeFile(resolve(directory, 'environment.json'), JSON.stringify(c, null, 2) + '\n');
await writeFile(resolve(directory, 'release.json'), JSON.stringify({ schemaVersion: 1, environment: c.environment, image, sourceCommit: release }, null, 2) + '\n');
console.log('Rendered API/HTTPS configuration. This does not install or activate services.');
