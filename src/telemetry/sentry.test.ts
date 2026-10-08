import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSentrySink, toSentryEvent } from './sentry';
import { createTelemetry, type TelemetryClient } from './client';
import type { DiagnosticSink, OutboxState, TelemetryEvent } from './types';

const DSN = 'https://publickey@sentry.example.test/123';
const ID = '10000000-0000-4000-8000-000000000002';
const sinks: DiagnosticSink[] = [];
const clients: TelemetryClient[] = [];
const event = (id = ID): TelemetryEvent => ({
  id, name: 'scramble_failed', timestamp: '2026-10-08T12:00:00.000Z',
  distinctId: '10000000-0000-4000-8000-000000000001',
  properties: { eventId: 'fto', code: 'GENERATION_FAILED' },
});
const makeSink = (fetcher: typeof fetch) => {
  const sink = createSentrySink({ dsn: DSN, appVersion: '0.1.0', environment: 'staging' }, { fetcher })!;
  sinks.push(sink);
  return sink;
};
function requestBody(init?: RequestInit): string {
  return typeof init?.body === 'string' ? init.body : new TextDecoder().decode(init?.body as Uint8Array);
}
afterEach(() => {
  clients.splice(0).forEach(client => client.dispose());
  sinks.splice(0).forEach(sink => sink.dispose?.());
});

describe('Sentry diagnostic transport using the real SDK', () => {
  it('requires a valid configured DSN and does not load the SDK without consent', async () => {
    const loadSdk = vi.fn(async () => {
      const { BrowserClient, makeFetchTransport } = await import('@sentry/browser');
      return { BrowserClient, makeFetchTransport };
    });
    expect(createSentrySink({}, { loadSdk })).toBeUndefined();
    expect(createSentrySink({ dsn: 'http://publickey@sentry.example.test/123' }, { loadSdk })).toBeUndefined();
    expect(createSentrySink({ dsn: 'https://publickey:secret@sentry.example.test/123' }, { loadSdk })).toBeUndefined();
    expect(createSentrySink({ dsn: `${DSN}?token=secret` }, { loadSdk })).toBeUndefined();
    const sink = createSentrySink({ dsn: DSN }, { loadSdk })!;
    sinks.push(sink);
    await expect(sink.send([event()], new AbortController().signal)).rejects.toThrow('disabled');
    expect(loadSdk).not.toHaveBeenCalled();
  });

  it('rebuilds events from fixed error codes and approved metadata', () => {
    const input = event();
    Object.assign(input, { user: { email: 'PRIVATE_EMAIL' }, request: { url: 'PRIVATE_RESET_TOKEN' } });
    Object.assign(input.properties, {
      message: 'PRIVATE_MESSAGE', stack: 'PRIVATE_STACK_URL', rawMs: 123456789,
      scramble: 'PRIVATE_SCRAMBLE', history: 'PRIVATE_HISTORY', engineVersion: 'PRIVATE_EMAIL@example.test',
    });
    const safe = toSentryEvent(input, { appVersion: '0.1.0', environment: 'staging' });
    expect(safe).toMatchObject({
      event_id: ID.replaceAll('-', ''), timestamp: Date.parse(input.timestamp) / 1000,
      message: 'scramble_failed: GENERATION_FAILED',
      contexts: { comp_sim: { eventId: 'fto', code: 'GENERATION_FAILED' } },
      sdk: { settings: { infer_ip: 'never' } },
    });
    expect(JSON.stringify(safe)).not.toContain('PRIVATE');
    expect(JSON.stringify(safe)).not.toContain('123456789');
    expect(safe).not.toHaveProperty('user');
    expect(safe).not.toHaveProperty('request');
  });

  it('sends a real SDK envelope without global-scope PII, raw errors, history or reset URLs', async () => {
    const sdk = await import('@sentry/browser');
    const scope = sdk.getGlobalScope();
    scope.setUser({ email: 'PRIVATE_EMAIL@example.test', ip_address: '192.0.2.123' });
    scope.setExtra('history', 'PRIVATE_HISTORY');
    scope.setTag('token', 'PRIVATE_RESET_TOKEN');
    const fetcher = vi.fn<typeof fetch>(async () => new Response('', { status: 200 }));
    const sink = makeSink(fetcher);
    try {
      sink.setEnabled?.(true);
      const input = event();
      Object.assign(input.properties, { message: 'PRIVATE_MESSAGE', stack: 'PRIVATE_STACK_URL', rawMs: 123456789, scramble: 'PRIVATE_SCRAMBLE' });
      await sink.send([input], new AbortController().signal);
      expect(fetcher).toHaveBeenCalledOnce();
      const [url, init] = fetcher.mock.calls[0];
      expect(String(url)).toContain('/api/123/envelope/');
      expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: false });
      const body = requestBody(init);
      expect(body).toContain('GENERATION_FAILED');
      expect(body).toContain(ID.replaceAll('-', ''));
      expect(body).toContain('"infer_ip":"never"');
      expect(body).not.toContain('PRIVATE');
      expect(body).not.toContain('192.0.2.123');
      expect(body).not.toContain('123456789');
      expect(body).not.toContain('"breadcrumbs"');
      expect(body).not.toContain('"stacktrace"');
    } finally { scope.clear(); }
  });

  it('does not treat a failed HTTP delivery as successful', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    const sink = makeSink(fetcher);
    sink.setEnabled?.(true);
    await expect(sink.send([event()], new AbortController().signal)).rejects.toThrow('delivery failed');
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('aborts in-flight delivery on opt-out and permits only a newly enabled client to send again', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      }))
      .mockResolvedValue(new Response('', { status: 200 }));
    const sink = makeSink(fetcher);
    sink.setEnabled?.(true);
    const delivery = sink.send([event()], new AbortController().signal);
    const rejection = expect(delivery).rejects.toThrow();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    const signal = fetcher.mock.calls[0][1]?.signal;
    sink.setEnabled?.(false);
    expect(signal?.aborted).toBe(true);
    await rejection;
    await expect(sink.send([event()], new AbortController().signal)).rejects.toThrow('disabled');
    expect(fetcher).toHaveBeenCalledOnce();
    sink.setEnabled?.(true);
    await sink.send([event('10000000-0000-4000-8000-000000000003')], new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not initialize a client after consent is withdrawn while the SDK is loading', async () => {
    let resume!: () => void;
    const blocked = new Promise<void>(resolve => { resume = resolve; });
    const fetcher = vi.fn<typeof fetch>(async () => new Response('', { status: 200 }));
    const loadSdk = vi.fn(async () => {
      await blocked;
      const { BrowserClient, makeFetchTransport } = await import('@sentry/browser');
      return { BrowserClient, makeFetchTransport };
    });
    const sink = createSentrySink({ dsn: DSN }, { fetcher, loadSdk })!;
    sinks.push(sink);
    sink.setEnabled?.(true);
    const pending = sink.send([event()], new AbortController().signal);
    const rejection = expect(pending).rejects.toThrow('disabled');
    sink.setEnabled?.(false);
    resume();
    await rejection;
    expect(loadSdk).toHaveBeenCalledOnce();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('ties global error hooks to diagnostic consent and never reads their raw contents', async () => {
    const source = new EventTarget();
    const fetcher = vi.fn<typeof fetch>(async () => new Response('', { status: 200 }));
    const sink = makeSink(fetcher);
    let stored: OutboxState | undefined;
    let counter = 0;
    const client = createTelemetry({
      store: { read: async () => stored, write: async value => { stored = structuredClone(value); } },
      diagnosticSink: sink, errorEvents: source,
      randomId: () => `20000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
    });
    clients.push(client);
    const unsafe = () => {
      const value = new Event('error');
      Object.defineProperty(value, 'message', { get: () => { throw new Error('Must never be read'); } });
      return value;
    };
    source.dispatchEvent(unsafe());
    await client.flush();
    expect(fetcher).not.toHaveBeenCalled();
    client.setConsent({ product: false, diagnostics: true });
    source.dispatchEvent(unsafe());
    await client.flush();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(requestBody(fetcher.mock.calls[0][1])).toContain('UNCAUGHT_ERROR');
    client.setConsent({ product: false, diagnostics: false });
    source.dispatchEvent(unsafe());
    await client.flush();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(stored?.events).toEqual([]);
  });
});
