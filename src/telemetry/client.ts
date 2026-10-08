import { safeBuildId, sanitizeProperties, isTelemetryEventName, UUID } from './sanitize';
import { EVENT_CATEGORIES, type DiagnosticEventName, type DiagnosticSink, type EventSink, type OutboxState, type OutboxStore, type ProductEventName, type TelemetryCategory, type TelemetryConsent, type TelemetryEvent, type TelemetryEventName, type TelemetryStatus } from './types';

export const MAX_EVENTS = 1_000;
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const BATCH_SIZE = 50;
const CATEGORIES: TelemetryCategory[] = ['product', 'diagnostics'];

interface PendingEvent extends Omit<TelemetryEvent, 'distinctId'> { generation: number }
export interface TelemetryOptions {
  store: OutboxStore;
  productSink?: EventSink;
  diagnosticSink?: DiagnosticSink;
  appVersion?: string;
  now?: () => number;
  randomId?: () => string;
  isOnline?: () => boolean;
}
export interface TelemetryClient {
  setConsent(consent: TelemetryConsent): void;
  getStatus(): TelemetryStatus;
  track(name: ProductEventName, properties?: Record<string, unknown>): void;
  reportError(name: DiagnosticEventName, properties?: Record<string, unknown>): void;
  flush(): Promise<void>;
  dispose(): void;
}

/** All work is optional and best effort. No caller awaits telemetry to commit a solve. */
export function createTelemetry(options: TelemetryOptions): TelemetryClient {
  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? (() => globalThis.crypto.randomUUID());
  const isOnline = options.isOnline ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const sinks = { product: options.productSink, diagnostics: options.diagnosticSink };
  const appVersion = safeBuildId(options.appVersion) ?? 'dev';
  const state: OutboxState = { version: 1, identities: {}, events: [] };
  const generation = { product: 0, diagnostics: 0 };
  let consent: TelemetryConsent = { product: false, diagnostics: false };
  let consentInitialized = false;
  let pending: PendingEvent[] = [];
  let hydrated = false;
  let disposed = false;
  let task = Promise.resolve();
  let inFlight: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: { category: TelemetryCategory; controller: AbortController } | undefined;
  let failures = 0;

  const enabled = (category: TelemetryCategory) => !disposed && consent[category] && Boolean(sinks[category]);
  const serial = (work: () => Promise<void>) => {
    task = task.then(work).catch(() => { /* Telemetry cannot break the application. */ });
    return task;
  };

  function fresh(timestamp: string): boolean {
    const value = Date.parse(timestamp);
    return Number.isFinite(value) && value >= now() - MAX_AGE_MS && value <= now() + 5 * 60_000;
  }

  async function hydrate() {
    if (hydrated) return;
    hydrated = true;
    const startGeneration = { ...generation };
    const startEnabled = { product: enabled('product'), diagnostics: enabled('diagnostics') };
    let raw: unknown;
    try { raw = await options.store.read(); } catch { return; }
    if (!raw || typeof raw !== 'object') return;
    const saved = raw as Record<string, unknown>;
    if (saved.version !== 1) return;
    const identities = saved.identities && typeof saved.identities === 'object' ? saved.identities as Record<string, unknown> : {};
    const mayRestore = (category: TelemetryCategory) => enabled(category) && startEnabled[category] && generation[category] === startGeneration[category];
    for (const category of CATEGORIES) {
      const id = identities[category];
      if (mayRestore(category) && typeof id === 'string' && UUID.test(id)) state.identities[category] = id;
    }
    if (!Array.isArray(saved.events)) return;
    for (const item of saved.events.slice(-MAX_EVENTS)) {
      if (!item || typeof item !== 'object') continue;
      const event = item as Record<string, unknown>;
      if (!isTelemetryEventName(event.name)) continue;
      const category = EVENT_CATEGORIES[event.name];
      if (!mayRestore(category) || typeof event.id !== 'string' || !UUID.test(event.id) || typeof event.timestamp !== 'string' || !fresh(event.timestamp)) continue;
      if (event.distinctId !== state.identities[category] || !state.identities[category]) continue;
      const properties = event.properties && typeof event.properties === 'object' ? event.properties as Record<string, unknown> : {};
      state.events.push({
        id: event.id, name: event.name, timestamp: event.timestamp, distinctId: String(event.distinctId),
        properties: { ...sanitizeProperties(event.name, properties), appVersion: safeBuildId(properties.appVersion) ?? appVersion },
      });
    }
  }

  function prune() {
    state.events = state.events.filter(event => enabled(EVENT_CATEGORIES[event.name]) && fresh(event.timestamp)).slice(-MAX_EVENTS);
    for (const category of CATEGORIES) if (!enabled(category)) delete state.identities[category];
  }

  async function persist() {
    try {
      // Clone before asynchronous storage so later consent changes cannot mutate a write.
      await options.store.write(structuredClone(state));
    } catch { /* Quota/private browsing failures affect telemetry only. */ }
  }

  async function drain() {
    if (disposed) return;
    await hydrate();
    if (disposed) return;
    const additions = pending;
    pending = [];
    for (const event of additions) {
      const category = EVENT_CATEGORIES[event.name];
      if (!enabled(category) || generation[category] !== event.generation) continue;
      const distinctId = state.identities[category] ?? randomId();
      if (!UUID.test(distinctId)) continue;
      state.identities[category] = distinctId;
      const { generation: _generation, ...data } = event;
      state.events.push({ ...data, distinctId });
    }
    prune();
    await persist();
  }

  function schedule(delay = 500) {
    if (disposed || timer || (!pending.length && !state.events.length)) return;
    timer = setTimeout(() => { timer = undefined; void flush(); }, delay);
  }

  function capture(name: TelemetryEventName, properties: Record<string, unknown>, category: TelemetryCategory) {
    if (!isTelemetryEventName(name) || EVENT_CATEGORIES[name] !== category || !enabled(category)) return;
    try {
      const id = randomId();
      if (!UUID.test(id)) return;
      pending.push({
        id, name, timestamp: new Date(now()).toISOString(), generation: generation[category],
        properties: { ...sanitizeProperties(name, properties), appVersion },
      });
      pending = pending.slice(-MAX_EVENTS);
      const overflow = state.events.length + pending.length - MAX_EVENTS;
      if (overflow > 0) state.events = state.events.slice(overflow);
      schedule();
    } catch { /* Invalid metadata or unavailable randomness is safe to discard. */ }
  }

  async function deliver() {
    await serial(drain);
    if (disposed || !isOnline()) return;
    for (const category of CATEGORIES) {
      const sink = sinks[category];
      if (!sink || !enabled(category)) continue;
      const batch = state.events.filter(event => EVENT_CATEGORIES[event.name] === category).slice(0, BATCH_SIZE);
      if (!batch.length) continue;
      const controller = new AbortController();
      active = { category, controller };
      const sendGeneration = generation[category];
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        await sink.send(batch, controller.signal);
        if (!controller.signal.aborted && enabled(category) && sendGeneration === generation[category]) {
          const delivered = new Set(batch.map(event => event.id));
          await serial(async () => {
            state.events = state.events.filter(event => !delivered.has(event.id));
            prune();
            await persist();
          });
          failures = 0;
        }
      } catch {
        // IDs and occurrence timestamps survive retries; the provider can deduplicate them.
        failures = Math.min(failures + 1, 6);
      } finally {
        clearTimeout(timeout);
        active = undefined;
      }
    }
  }

  function flush(): Promise<void> {
    if (disposed || !consentInitialized) return Promise.resolve();
    if (inFlight) return inFlight;
    if (timer) { clearTimeout(timer); timer = undefined; }
    inFlight = deliver().catch(() => {}).finally(() => {
      inFlight = undefined;
      schedule(failures ? Math.min(5_000 * 2 ** (failures - 1), 300_000) : isOnline() ? 500 : 30_000);
    });
    return inFlight;
  }

  return {
    setConsent(next) {
      if (disposed) return;
      consentInitialized = true;
      for (const category of CATEGORIES) {
        if (next[category] !== true) {
          generation[category]++;
          pending = pending.filter(event => EVENT_CATEGORIES[event.name] !== category);
          state.events = state.events.filter(event => EVENT_CATEGORIES[event.name] !== category);
          delete state.identities[category];
          if (active?.category === category) active.controller.abort();
        }
      }
      consent = { product: next.product === true, diagnostics: next.diagnostics === true };
      void serial(drain).then(() => schedule());
    },
    getStatus() {
      return { productConfigured: Boolean(sinks.product), diagnosticsConfigured: Boolean(sinks.diagnostics), consent: { ...consent }, queued: state.events.length + pending.length };
    },
    track: (name, properties = {}) => capture(name, properties, 'product'),
    reportError: (name, properties = {}) => capture(name, properties, 'diagnostics'),
    flush,
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      active?.controller.abort();
      // Committed outbox entries survive a normal close. No last-second network send.
    },
  };
}
