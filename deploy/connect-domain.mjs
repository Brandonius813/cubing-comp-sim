import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
const approved = { staging: ['https://staging.cubingcompsim.com', 'ccs-staging-frontend'], production: ['https://cubingcompsim.com', 'ccs-production-frontend'] };
const targetEnvironment = approved[config.environment];
if (!targetEnvironment || config.appUrl !== targetEnvironment[0] || config.workerName !== targetEnvironment[1]) throw new Error('Use the exact approved environment hostname and Worker.');
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!/^[a-f0-9]{32}$/i.test(account ?? '') || !token) throw new Error('Missing Cloudflare deployment credentials.');
async function request(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
  if (response.status === 204 && response.ok) return undefined;
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    // Provider responses can contain request data. Report only status and numeric codes.
    console.error(JSON.stringify({ operation: `${config.environment}_domain_connection`, status: response.status, codes: payload.errors?.map(value => value.code) }));
    throw new Error('Environment hostname connection failed; inspect the safe status/code above.');
  }
  return payload.result;
}
const hostname = new URL(config.appUrl).hostname;
// Verify the target exists before detaching a live hostname.
await request(`scripts/${config.workerName}/settings`);
const domains = await request('domains');
const current = domains.find(domain => domain.hostname === hostname);
if (!current) {
  // Recover an interrupted detach/attach operation for this one approved host.
  await request('domains', 'PUT', { hostname, service: config.workerName, enabled: true, previews_enabled: false, zone_name: 'cubingcompsim.com' });
  console.log(`Connected the approved ${config.environment} hostname to its deployed Worker.`);
} else if (current.service === config.workerName) console.log(`${config.environment} hostname already points to its Worker.`);
else {
  if (current.service !== 'morning-base-55f2') throw new Error('Hostname points to an unexpected Worker; review before reassignment.');
  // The attach API rejects a hostname still assigned to another Worker (409).
  // Detach this exact staging mapping and restore it if the new attachment fails.
  // Domain IDs are opaque (some accounts return UUIDs); encode the selected ID.
  if (typeof current.id !== 'string' || !current.id || current.id.length > 128) throw new Error('Unexpected domain identifier.');
  const target = { hostname, enabled: true, previews_enabled: false, zone_name: 'cubingcompsim.com' };
  await request(`domains/${encodeURIComponent(current.id)}`, 'DELETE');
  try {
    await request('domains', 'PUT', { ...target, service: config.workerName });
  } catch (error) {
    await request('domains', 'PUT', { ...target, service: current.service });
    console.log('Restored the previous hostname mapping after activation failed.');
    throw error;
  }
  console.log(`Connected the existing ${config.environment} hostname to its isolated Worker.`);
}
