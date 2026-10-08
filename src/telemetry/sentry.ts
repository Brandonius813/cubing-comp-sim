import { EVENT_CATEGORIES, type DiagnosticSink, type TelemetryEvent } from './types';
import { isTelemetryEventName, safeBuildId, sanitizeProperties, UUID } from './sanitize';

type SentryModule = Pick<typeof import('@sentry/browser'), 'BrowserClient' | 'makeFetchTransport'>;
type SentryClient = InstanceType<SentryModule['BrowserClient']>;
// beforeSend accepts error events only, while captureEvent also accepts transactions.
type SentryEvent = Parameters<NonNullable<ConstructorParameters<SentryModule['BrowserClient']>[0]['beforeSend']>>[0];

export interface SentryConfig {
  dsn?: string;
  appVersion?: string;
  environment?: 'development' | 'staging' | 'production';
}
export interface SentryDependencies {
  loadSdk?: () => Promise<SentryModule>;
  fetcher?: typeof fetch;
}

/** Never accept a credential-bearing URL, query string, or non-HTTPS endpoint. */
function validDsn(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /^[a-zA-Z0-9]+$/.test(url.username)
      && !url.password && !url.search && !url.hash && /^\/(?:[a-zA-Z0-9_-]+\/)*[0-9]+$/.test(url.pathname);
  } catch { return false; }
}

/** Fixed codes and approved metadata only. No Error messages, stacks, URLs, or user IDs. */
export function toSentryEvent(event: TelemetryEvent, config: SentryConfig): SentryEvent | undefined {
  if (!isTelemetryEventName(event.name) || EVENT_CATEGORIES[event.name] !== 'diagnostics' || !UUID.test(event.id)) return undefined;
  const occurred = Date.parse(event.timestamp);
  if (!Number.isFinite(occurred)) return undefined;
  const properties = sanitizeProperties(event.name, event.properties);
  const code = typeof properties.code === 'string' ? properties.code : 'UNKNOWN';
  return {
    event_id: event.id.replaceAll('-', ''),
    timestamp: occurred / 1_000,
    platform: 'javascript',
    level: 'error',
    release: `cubing-comp-sim@${safeBuildId(config.appVersion) ?? 'dev'}`,
    environment: config.environment ?? 'production',
    message: `${event.name}: ${code}`,
    exception: { values: [{ type: event.name, value: code }] },
    fingerprint: [event.name, code],
    tags: { diagnostic: event.name, code },
    contexts: { comp_sim: properties },
    // v11 defaults can otherwise infer IP. Keep the explicit privacy setting after rebuilding.
    sdk: { name: 'sentry.javascript.browser', version: '11.6.0', settings: { infer_ip: 'never' } },
  };
}

interface ActiveClient {
  client: SentryClient;
  controller: AbortController;
  approved: Map<string, SentryEvent>;
  delivered: Set<string>;
}

/** The SDK is bundled locally but not loaded or initialized until a consented error is sent. */
export function createSentrySink(config: SentryConfig, dependencies: SentryDependencies = {}): DiagnosticSink | undefined {
  if (!validDsn(config.dsn)) return undefined;
  const loadSdk = dependencies.loadSdk ?? (async () => {
    const { BrowserClient, makeFetchTransport } = await import('@sentry/browser');
    return { BrowserClient, makeFetchTransport };
  });
  const fetcher = dependencies.fetcher ?? globalThis.fetch.bind(globalThis);
  let enabled = false;
  let disposed = false;
  let generation = 0;
  let active: ActiveClient | undefined;
  let loading: Promise<ActiveClient> | undefined;

  function closeActive() {
    const previous = active;
    active = undefined;
    if (!previous) return;
    previous.approved.clear();
    previous.delivered.clear();
    previous.controller.abort();
    previous.client.getOptions().enabled = false;
    // close() normally flushes. The disabled client, denied events, and aborted transport
    // prevent it from sending queued data after consent is withdrawn.
    void Promise.resolve(previous.client.close(1)).catch(() => {});
  }

  async function acquire(): Promise<ActiveClient> {
    if (active) return active;
    if (loading) return loading;
    const started = generation;
    const promise = (async () => {
      const sdk = await loadSdk();
      if (!enabled || disposed || started !== generation) throw new Error('Diagnostics disabled');
      const controller = new AbortController();
      const approved = new Map<string, SentryEvent>();
      const delivered = new Set<string>();
      const guardedFetch: typeof fetch = (input, init) => {
        if (!enabled || disposed || controller.signal.aborted || started !== generation) return Promise.reject(new Error('Diagnostics disabled'));
        return fetcher(input, { ...init, credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: false, signal: controller.signal });
      };
      const client = new sdk.BrowserClient({
        dsn: config.dsn,
        enabled: true,
        integrations: [],
        stackParser: () => [],
        transport: options => sdk.makeFetchTransport(options, guardedFetch),
        attachStacktrace: false,
        maxBreadcrumbs: 0,
        sendClientReports: false,
        enableLogs: false,
        tracesSampleRate: 0,
        replaysSessionSampleRate: 0,
        replaysOnErrorSampleRate: 0,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          graphQL: { document: false, variables: false },
          genAI: { inputs: false, outputs: false },
          databaseQueryData: false,
          queues: false,
          stackFrameVariables: false,
          frameContextLines: 0,
        },
        beforeSend(event) {
          if (!enabled || disposed || started !== generation || controller.signal.aborted) return null;
          const safe = event.event_id && approved.get(event.event_id);
          // Discard SDK/global-scope additions, even if future integrations add them.
          return safe ? structuredClone(safe) : null;
        },
      });
      client.on('afterSendEvent', (event, response) => {
        if (event.event_id && response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          delivered.add(event.event_id);
          while (delivered.size > 1_000) delivered.delete(delivered.values().next().value!);
        }
      });
      client.init();
      active = { client, controller, approved, delivered };
      return active;
    })();
    loading = promise;
    try { return await promise; } finally { if (loading === promise) loading = undefined; }
  }

  return {
    setEnabled(value) {
      if (disposed || value === enabled) return;
      enabled = value;
      generation++;
      if (!enabled) closeActive();
    },
    async send(events, signal) {
      if (!enabled || disposed || signal.aborted) throw new Error('Diagnostics disabled');
      const started = generation;
      const runtime = await acquire();
      if (!enabled || signal.aborted || started !== generation) throw new Error('Diagnostics disabled');
      const abort = () => { generation++; closeActive(); };
      signal.addEventListener('abort', abort, { once: true });
      const safeEvents = events.map(event => toSentryEvent(event, config)).filter((event): event is SentryEvent => Boolean(event));
      try {
        // Small groups avoid overflowing the SDK's bounded transport queue.
        for (let index = 0; index < safeEvents.length; index += 10) {
          if (!enabled || disposed || signal.aborted || started !== generation) throw new Error('Diagnostics disabled');
          const group = safeEvents.slice(index, index + 10);
          for (const event of group) {
            if (!event.event_id || runtime.delivered.has(event.event_id)) continue;
            runtime.approved.set(event.event_id, event);
            runtime.client.captureEvent(structuredClone(event));
          }
          const flushed = await runtime.client.flush(5_000);
          if (!flushed || signal.aborted || group.some(event => !event.event_id || !runtime.delivered.has(event.event_id))) {
            throw new Error('Diagnostics delivery failed');
          }
        }
      } finally {
        signal.removeEventListener('abort', abort);
        safeEvents.forEach(event => { if (event.event_id) runtime.approved.delete(event.event_id); });
      }
    },
    dispose() {
      enabled = false;
      disposed = true;
      generation++;
      closeActive();
    },
  };
}
