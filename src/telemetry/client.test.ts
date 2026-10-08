import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelemetry, MAX_AGE_MS, MAX_EVENTS, type TelemetryClient } from './client';
import { createPostHogSink } from './posthog';
import type { EventSink, OutboxState, OutboxStore, TelemetryEvent } from './types';

const NOW = Date.UTC(2026, 9, 8, 12);
const INSTALLATION_ID = '10000000-0000-4000-8000-000000000001';
const EVENT_ID = '10000000-0000-4000-8000-000000000002';
const clients: TelemetryClient[] = [];
const makeId = () => {
  let counter = 0;
  return vi.fn(() => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`);
};

function storeFixture(initial?: unknown) {
  let value = initial;
  const store: OutboxStore = {
    read: vi.fn(async () => structuredClone(value)),
    write: vi.fn(async state => { value = structuredClone(state); }),
  };
  return { store, read: () => value as OutboxState | undefined };
}
function client(options: Parameters<typeof createTelemetry>[0]) {
  const value = createTelemetry({ now: () => NOW, randomId: makeId(), ...options });
  clients.push(value);
  return value;
}
afterEach(() => { clients.splice(0).forEach(value => value.dispose()); vi.useRealTimers(); });

describe('telemetry privacy and failure isolation', () => {
  it('collects nothing without consent or a configured provider', async () => {
    const configuredSink = { send: vi.fn(async () => {}) };
    const first = storeFixture();
    const ids = makeId();
    const configured = client({ store: first.store, productSink: configuredSink, randomId: ids });
    configured.track('attempt_recorded', { eventId: '333' });
    expect(ids).not.toHaveBeenCalled();
    expect(first.store.read).not.toHaveBeenCalled();
    await configured.flush();
    expect(configuredSink.send).not.toHaveBeenCalled();

    const second = storeFixture();
    const unconfigured = client({ store: second.store, randomId: ids });
    unconfigured.setConsent({ product: true, diagnostics: true });
    unconfigured.track('round_started', { eventId: '333' });
    unconfigured.reportError('scramble_failed', { code: 'GENERATION_FAILED' });
    await unconfigured.flush();
    expect(ids).not.toHaveBeenCalled();
    expect(second.read()).toEqual({ version: 1, identities: {}, events: [] });
    expect(unconfigured.getStatus()).toMatchObject({ productConfigured: false, diagnosticsConfigured: false, queued: 0 });
  });

  it('sends only allowlisted metadata and strips untrusted fields and enum values', async () => {
    const sink: EventSink = { send: vi.fn(async () => {}) };
    const instance = client({ store: storeFixture().store, productSink: sink });
    instance.setConsent({ product: true, diagnostics: false });
    instance.track('attempt_recorded', {
      eventId: '333', inputMode: 'timer', attemptToken: EVENT_ID,
      email: 'private@example.com', rawMs: 1234, scramble: 'R U', history: [{ private: true }],
      url: 'https://example.com/reset?token=secret', appVersion: 'injected', roundToken: 'private@example.com',
    });
    await instance.flush();
    const events = vi.mocked(sink.send).mock.calls[0][0];
    expect(events[0].properties).toEqual({ eventId: '333', inputMode: 'timer', attemptToken: EVENT_ID, appVersion: 'dev' });
    expect(JSON.stringify(events)).not.toContain('private');
    expect(instance.getStatus().queued).toBe(0);
  });

  it('preserves IDs, original timestamp, and anonymous identity through retries', async () => {
    const sink: EventSink = { send: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined) };
    const memory = storeFixture();
    const instance = client({ store: memory.store, productSink: sink });
    instance.setConsent({ product: true, diagnostics: false });
    instance.track('round_started', { eventId: 'fto', inputMode: 'manual' });
    await instance.flush();
    const saved = structuredClone(memory.read()?.events[0]);
    expect(instance.getStatus().queued).toBe(1);
    await instance.flush();
    const calls = vi.mocked(sink.send).mock.calls;
    expect(calls[0][0][0]).toEqual(calls[1][0][0]);
    expect(calls[1][0][0]).toEqual(saved);
    expect(saved?.timestamp).toBe(new Date(NOW).toISOString());
    expect(instance.getStatus().queued).toBe(0);
  });

  it('consent withdrawal aborts delivery, clears pending/stored data and rotates the ID', async () => {
    let oldId: string | undefined;
    const send = vi.fn<EventSink['send']>().mockImplementationOnce(async (events, signal) => {
      oldId = events[0].distinctId;
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    }).mockResolvedValue(undefined);
    const memory = storeFixture();
    const instance = client({ store: memory.store, productSink: { send } });
    instance.setConsent({ product: true, diagnostics: false });
    instance.track('round_started', { eventId: '333' });
    const delivery = instance.flush();
    await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
    instance.setConsent({ product: false, diagnostics: false });
    await delivery;
    await instance.flush();
    expect(memory.read()).toEqual({ version: 1, identities: {}, events: [] });
    instance.setConsent({ product: true, diagnostics: false });
    instance.track('round_started', { eventId: '333' });
    await instance.flush();
    expect(send.mock.calls[1][0][0].distinctId).not.toBe(oldId);
  });

  it('does not restore old consented records if consent is withdrawn during hydration', async () => {
    let resolveRead!: (value: unknown) => void;
    const store: OutboxStore = { read: vi.fn(() => new Promise(resolve => { resolveRead = resolve; })), write: vi.fn(async () => {}) };
    const sink: EventSink = { send: vi.fn(async () => {}) };
    const instance = client({ store, productSink: sink });
    instance.setConsent({ product: true, diagnostics: false });
    const flush = instance.flush();
    await vi.waitFor(() => expect(store.read).toHaveBeenCalled());
    instance.setConsent({ product: false, diagnostics: false });
    instance.setConsent({ product: true, diagnostics: false });
    resolveRead({ version: 1, identities: { product: INSTALLATION_ID }, events: [{
      id: EVENT_ID, name: 'attempt_recorded', timestamp: new Date(NOW).toISOString(),
      distinctId: INSTALLATION_ID, properties: { eventId: '333' },
    }] });
    await flush;
    expect(sink.send).not.toHaveBeenCalled();
    expect(instance.getStatus().queued).toBe(0);
  });

  it('keeps only a bounded seven-day outbox and never uploads expired records', async () => {
    const old: TelemetryEvent = { id: EVENT_ID, name: 'attempt_recorded', timestamp: new Date(NOW - MAX_AGE_MS - 1).toISOString(), distinctId: INSTALLATION_ID, properties: { eventId: '333' } };
    const memory = storeFixture({ version: 1, identities: { product: INSTALLATION_ID }, events: [old] });
    const sink = { send: vi.fn(async () => {}) };
    const instance = client({ store: memory.store, productSink: sink, isOnline: () => false });
    instance.setConsent({ product: true, diagnostics: false });
    for (let i = 0; i < MAX_EVENTS + 20; i++) instance.track('attempt_recorded', { eventId: '333' });
    await instance.flush();
    expect(memory.read()?.events).toHaveLength(MAX_EVENTS);
    expect(memory.read()?.events.some(event => event.id === EVENT_ID)).toBe(false);
    expect(sink.send).not.toHaveBeenCalled();
  });

  it('revalidates stored payloads and retains the installation ID after reopening', async () => {
    const memory = storeFixture({ version: 1, identities: { product: INSTALLATION_ID }, events: [{
      id: EVENT_ID, name: 'attempt_recorded', timestamp: new Date(NOW).toISOString(),
      distinctId: INSTALLATION_ID, properties: { eventId: '333', email: 'private@example.com', rawMs: 1000 },
    }] });
    const sink: EventSink = { send: vi.fn(async () => {}) };
    const instance = client({ store: memory.store, productSink: sink });
    // A reconnect event before device preferences load must not erase the previous ID.
    await instance.flush();
    expect(memory.store.read).not.toHaveBeenCalled();
    instance.setConsent({ product: true, diagnostics: false });
    instance.track('round_started', { eventId: 'clock' });
    await instance.flush();
    const events = vi.mocked(sink.send).mock.calls[0][0];
    expect(events).toHaveLength(2);
    expect(events.every(event => event.distinctId === INSTALLATION_ID)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('private');
  });

  it('storage failure does not reject the caller or prevent best-effort delivery', async () => {
    const sink = { send: vi.fn(async () => {}) };
    const store: OutboxStore = { read: vi.fn(async () => { throw new Error('unavailable'); }), write: vi.fn(async () => { throw new Error('quota'); }) };
    const instance = client({ store, productSink: sink });
    expect(() => instance.setConsent({ product: true, diagnostics: false })).not.toThrow();
    expect(() => instance.track('round_completed', { eventId: '333', attemptCount: 5 })).not.toThrow();
    await expect(instance.flush()).resolves.toBeUndefined();
    expect(sink.send).toHaveBeenCalledOnce();
  });

  it('keeps product and diagnostic consent independent and never reads Error contents', async () => {
    const product: EventSink = { send: vi.fn(async () => {}) };
    const diagnostics: EventSink = { send: vi.fn(async () => {}) };
    const instance = client({ store: storeFixture().store, productSink: product, diagnosticSink: diagnostics });
    instance.setConsent({ product: false, diagnostics: true });
    instance.track('round_started', { eventId: '333' });
    instance.reportError('scramble_failed', { eventId: 'fto', code: 'GENERATION_FAILED', message: 'secret', stack: 'secret url', error: new Error('secret') });
    await instance.flush();
    expect(product.send).not.toHaveBeenCalled();
    const event = vi.mocked(diagnostics.send).mock.calls[0][0][0];
    expect(event.properties).toEqual({ eventId: 'fto', code: 'GENERATION_FAILED', appVersion: 'dev' });
  });

  it('keeps the pinned TNoodle build ID while rejecting email-shaped engine metadata', async () => {
    const diagnostics: EventSink = { send: vi.fn(async () => {}) };
    const instance = client({ store: storeFixture().store, diagnosticSink: diagnostics });
    instance.setConsent({ product: false, diagnostics: true });
    const version = 'tnoodle-lib@d01a947d9f028f38085cda9b0507a9cf3d3f38a8+webcrypto.2';
    instance.reportError('scramble_failed', { engineVersion: version });
    instance.reportError('scramble_failed', { engineVersion: 'private@example.com' });
    await instance.flush();
    const events = vi.mocked(diagnostics.send).mock.calls[0][0];
    expect(events[0].properties.engineVersion).toBe(version);
    expect(events[1].properties).not.toHaveProperty('engineVersion');
  });
});

describe('PostHog public event transport', () => {
  it('requires an explicit HTTPS ingestion host and project token', () => {
    expect(createPostHogSink({})).toBeUndefined();
    expect(createPostHogSink({ key: 'test', host: 'http://example.com' })).toBeUndefined();
    expect(createPostHogSink({ key: 'test', host: 'https://user:pass@example.com' })).toBeUndefined();
    expect(createPostHogSink({ key: 'test', host: 'https://example.com/?token=secret' })).toBeUndefined();
  });

  it('posts stable event IDs/timestamps without cookies, referrer, profiles, or extra fields', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 200 }));
    const sink = createPostHogSink({ key: 'project_test', host: 'https://us.i.posthog.com' }, fetcher);
    await sink?.send([{ id: EVENT_ID, name: 'round_started', timestamp: new Date(NOW).toISOString(), distinctId: INSTALLATION_ID, properties: { eventId: '333' } }], new AbortController().signal);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://us.i.posthog.com/batch/');
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
    expect(JSON.parse(String(init.body))).toEqual({ api_key: 'project_test', batch: [{ uuid: EVENT_ID, event: 'round_started', timestamp: new Date(NOW).toISOString(), distinct_id: INSTALLATION_ID, properties: { eventId: '333', $process_person_profile: false, $geoip_disable: true } }] });
  });
});
