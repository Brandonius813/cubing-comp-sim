import { auth } from '../cloud';

const endpoint = import.meta.env.VITE_SUPABASE_URL ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/observability` : '';
const enabled = () => location.origin === 'https://cubingcompsim.com' && !!endpoint && !/[?&#](?:code|access_token|refresh_token|token_hash)=/.test(location.search + location.hash);
export const reportDay = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
function referrerOrigin() { try { return new URL(document.referrer).origin; } catch { return ''; } }
function visitor() {
  try {
    let id = localStorage.getItem('ccs-observed-browser');
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { id = crypto.randomUUID(); localStorage.setItem('ccs-observed-browser', id); }
    return id;
  } catch { return crypto.randomUUID(); }
}
async function adminRequest(payload: Record<string, string>): Promise<any> {
  const session = await auth.getSession();
  if (!session) throw new Error('Sign in to your administrator account to continue.');
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.accessToken}` },
    body: JSON.stringify(payload), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(20000) });
  if (response.status === 401) throw new Error('Your session expired. Sign in again.');
  if (response.status === 403) throw new Error('Access denied. Only the verified administrator account can view this dashboard.');
  if (!response.ok) throw new Error('Dashboard data is unavailable. Please retry.');
  return response.json();
}
export const dashboardRequest = (start: string, end: string) => adminRequest({ action: 'dashboard', start, end });
export const configureAlerts = (key: string, from: string) => adminRequest({ action: 'configure-alerts', key, from });
type Event = { kind: 'visit' | 'activity' | 'error' | 'api'; day: string; userId?: string; code?: string; status?: number; duration?: number };
let busy = false;
let queue: Event[] = [];
try { queue = JSON.parse(localStorage.getItem('ccs-activity-outbox') || '[]').filter((e: Event) => e.kind === 'activity' && typeof e.userId === 'string').slice(-7); } catch { /* Storage unavailable. */ }
function save() { try { localStorage.setItem('ccs-activity-outbox', JSON.stringify(queue.filter(e => e.kind === 'activity').slice(-7))); } catch { /* Optional best effort. */ } }
async function flush() {
  if (busy || !enabled() || !navigator.onLine) return;
  busy = true;
  try {
    const session = await auth.getSession();
    while (queue.length) {
      const event = queue[0];
      if (event.kind === 'activity' && event.userId !== session?.user.id) { queue.shift(); save(); continue; }
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}) },
        body: JSON.stringify({ ...event, userId: undefined, visitor: visitor(), referrer: event.kind === 'visit' ? referrerOrigin() : undefined }), credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) });
      if (response.status >= 500 || response.status === 401) break;
      queue.shift(); save();
    }
  } catch { /* Monitoring never blocks local practice. */ }
  finally { busy = false; }
}
export function recordVisit() { if (enabled()) { queue.push({ kind: 'visit', day: reportDay() }); void flush(); } }
const sent = new Set<string>();
export async function recordActivity() {
  if (!enabled()) return;
  try {
    const session = await auth.getSession(); if (!session) return;
    const day = reportDay(); const key = `${session.user.id}:${day}`;
    if (sent.has(key)) return;
    sent.add(key);
    queue.push({ kind: 'activity', day, userId: session.user.id }); save(); void flush();
  } catch { /* Monitoring never blocks saving. */ }
}
export function recordOperation(code: string, status: number, duration: number) {
  if (enabled() && queue.length < 50) { queue.push({ kind: 'api', day: reportDay(), code, status, duration: Math.round(duration) }); void flush(); }
}
export function recordFailure(code: string) {
  if (enabled() && queue.length < 50) { queue.push({ kind: 'error', day: reportDay(), code }); void flush(); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('ccs-api-observed', ((event: CustomEvent) => recordOperation(event.detail.code, event.detail.status, event.detail.duration)) as EventListener);
  window.addEventListener('online', () => { void flush(); });
  window.addEventListener('error', () => recordFailure('client_error'));
  window.addEventListener('unhandledrejection', () => recordFailure('client_error'));
}
