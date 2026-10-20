import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

const url = Deno.env.get('SUPABASE_URL')!;
const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = 'https://cubingcompsim.com';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await service.rpc(name, args);
  if (error) throw new Error(error.code === '42501' ? 'forbidden' : 'database_unavailable');
  return data;
}
async function monitor(secret: string) {
  const config = await rpc('ccs_metrics_monitor_config', { p_secret: secret });
  const checks = await Promise.all([
    ['Website', origin + '/'], ['Cloud API', 'https://api.cubingcompsim.com/health'], ['Authentication', url + '/auth/v1/health'],
  ].map(async ([name, endpoint]) => {
    const start = performance.now(); let status = 0; let ok = false;
    try {
      const response = await fetch(endpoint, { headers: name === 'Authentication' ? { apikey: Deno.env.get('SUPABASE_ANON_KEY')! } : {}, signal: AbortSignal.timeout(10000), cache: 'no-store' });
      status = response.status; ok = response.ok;
      if (name === 'Cloud API' && ok) ok = (await response.json()).status === 'ok';
      else await response.body?.cancel();
    } catch { /* Fixed failure metadata only. */ }
    const args = { p_service: name, p_ok: ok, p_status: status, p_latency: Math.round(performance.now()-start) };
    const alert = await rpc('ccs_metrics_probe', args);
    if (alert) {
      let result = 'Not configured: sending credential required';
      if (config.mailKey && config.mailFrom) {
        try {
          const sent = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${config.mailKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: config.mailFrom, to: [config.recipient], subject: `Cubing Comp Sim: ${name} check failed`, text: `${name} failed two consecutive checks. HTTP status: ${status}. Open ${origin}/admin/ for details.` }), signal: AbortSignal.timeout(10000) });
          result = sent.ok ? 'Accepted by email provider' : `Email provider returned ${sent.status}`;
        } catch { result = 'Email delivery request failed'; }
      }
      await rpc('ccs_metrics_probe', { ...args, p_mail: result });
    }
    return { name, ok, status };
  }));
  return reply({ checks });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  if (Number(req.headers.get('content-length') || 0) > 2048) return reply({ error: 'too_large' }, 413);
  try {
    const text = await req.text();
    if (text.length > 2048) return reply({ error: 'too_large' }, 413);
    const body = JSON.parse(text);
    if (body.action === 'monitor') return await monitor(String(body.secret || ''));
    if (req.headers.get('origin') !== origin) return reply({ error: 'origin_rejected' }, 403);
    let userId: string | null = null;
    const bearer = req.headers.get('authorization')?.replace(/^Bearer /i, '');
    if (bearer) {
      const { data, error } = await service.auth.getUser(bearer);
      if (error || !data.user) return reply({ error: 'unauthorized' }, 401);
      userId = data.user.id;
    }
    if (body.action === 'configure-alerts') {
      if (!userId) return reply({ error: 'unauthorized' }, 401);
      await rpc('ccs_metrics_configure_alerts', { p_user: userId, p_key: body.key, p_from: body.from });
      return reply({ configured: true });
    }
    if (body.action === 'dashboard') {
      if (!userId) return reply({ error: 'unauthorized' }, 401);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.start) || !/^\d{4}-\d{2}-\d{2}$/.test(body.end)) return reply({ error: 'invalid_dates' }, 400);
      return reply(await rpc('ccs_metrics_read', { p_user: userId, p_start: body.start, p_end: body.end }));
    }
    if (!uuid.test(body.visitor || '') || !['visit','activity','error','api'].includes(body.kind)) return reply({ error: 'invalid_event' }, 400);
    if (body.kind === 'activity' && !userId) return reply({ error: 'unauthorized' }, 401);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.day)) return reply({ error: 'invalid_day' }, 400);
    let referrer = '';
    try { referrer = new URL(body.referrer).hostname.slice(0,160); } catch { /* No referrer. */ }
    // IDs are random browser identifiers, not fingerprints. Only the server verifies account ownership.
    const accepted = await rpc('ccs_metrics_ingest', { p_kind: body.kind, p_visitor: body.visitor, p_user: userId, p_day: body.day,
      p_referrer: referrer, p_bucket: userId || body.visitor, p_code: String(body.code || '').slice(0,40),
      p_status: Number.isInteger(body.status) ? body.status : 0, p_duration: Number.isInteger(body.duration) ? body.duration : 0 });
    return reply({ accepted }, accepted ? 200 : 429);
  } catch (error) {
    const forbidden = error instanceof Error && error.message === 'forbidden';
    return reply({ error: forbidden ? 'forbidden' : 'request_failed' }, forbidden ? 403 : 400);
  }
});
