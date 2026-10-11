import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (config.environment !== 'staging' || config.appUrl !== 'https://staging.cubingcompsim.com') throw new Error('This activation command is limited to the approved staging hostname.');
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!/^[a-f0-9]{32}$/i.test(account ?? '') || !token) throw new Error('Missing Cloudflare deployment credentials.');
async function request(path, method = 'GET', body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  });
  const payload = await response.json();
  if (!response.ok || !payload.success) {
    // Provider responses can contain request data. Report only status and numeric codes.
    console.error(JSON.stringify({ operation: 'staging_domain_connection', status: response.status, codes: payload.errors?.map(value => value.code) }));
    throw new Error('Staging hostname connection failed; inspect the safe status/code above.');
  }
  return payload.result;
}
const hostname = new URL(config.appUrl).hostname;
const domains = await request('domains');
const current = domains.find(domain => domain.hostname === hostname);
if (!current) throw new Error('The existing staging custom domain was not found; stop before changing DNS.');
if (current.service === config.workerName) console.log('Staging hostname already points to the isolated Worker.');
else {
  if (current.service !== 'morning-base-55f2') throw new Error('Staging hostname points to an unexpected Worker; review before reassignment.');
  // The attach API rejects a hostname still assigned to another Worker (409).
  // Detach this exact staging mapping and restore it if the new attachment fails.
  if (!/^[a-f0-9]{32}$/i.test(current.id ?? '') || !/^[a-f0-9]{32}$/i.test(current.zone_id ?? '')) throw new Error('Unexpected domain identifiers.');
  await request(`domains/${current.id}`, 'DELETE');
  try {
    await request('domains', 'PUT', { hostname, service: config.workerName, enabled: true, previews_enabled: false, zone_id: current.zone_id });
  } catch (error) {
    await request('domains', 'PUT', { hostname, service: current.service, enabled: true, previews_enabled: false, zone_id: current.zone_id });
    console.log('Restored the previous staging hostname mapping after activation failed.');
    throw error;
  }
  console.log('Connected the existing staging hostname to its isolated Worker.');
}
