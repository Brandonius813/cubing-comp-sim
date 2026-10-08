import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScrambleService } from './service';
import { isScrambleEvent } from './types';

class TestWorker {
  static created: TestWorker[] = [];
  onmessage?: (event: {data: unknown}) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { TestWorker.created.push(this); }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  TestWorker.created = [];
});

describe('scramble boundary', () => {
  it('includes Clock and FTO and rejects excluded events without starting a worker', async () => {
    expect(isScrambleEvent('clock')).toBe(true);
    expect(isScrambleEvent('fto')).toBe(true);
    vi.stubGlobal('Worker', TestWorker);
    const service = createScrambleService();
    await expect(service.generate('333fm')).rejects.toMatchObject({code: 'UNSUPPORTED_EVENT'});
    await expect(service.generate('333mbf')).rejects.toMatchObject({code: 'UNSUPPORTED_EVENT'});
    expect(TestWorker.created).toHaveLength(0);
    service.dispose();
  });

  it('returns only the worker response for the matching request', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const service = createScrambleService();
    const result = service.generate('333');
    const worker = TestWorker.created[0];
    const request = worker.postMessage.mock.calls[0][0];
    const scramble = {eventId: '333', notation: 'reference fixture', svg: '<svg></svg>', engineVersion: 'fixture', generatedAt: 100};
    worker.onmessage?.({data: {type: 'result', id: request.id, scramble}});
    await expect(result).resolves.toEqual(scramble);
    service.dispose();
  });

  it('rejects a missing compiled engine without substituting a scramble', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const service = createScrambleService();
    const result = service.generate('fto');
    const worker = TestWorker.created[0];
    const request = worker.postMessage.mock.calls[0][0];
    worker.onmessage?.({data: {type: 'error', id: request.id, code: 'ENGINE_UNAVAILABLE', message: 'Engine absent'}});
    await expect(result).rejects.toMatchObject({code: 'ENGINE_UNAVAILABLE'});
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    service.dispose();
  });

  it('disposal terminates work and rejects pending and later requests', async () => {
    vi.stubGlobal('Worker', TestWorker);
    const service = createScrambleService();
    const result = service.generate('clock');
    const rejected = expect(result).rejects.toMatchObject({code: 'DISPOSED'});
    service.dispose();
    await rejected;
    expect(TestWorker.created[0].terminate).toHaveBeenCalledOnce();
    await expect(service.generate('clock')).rejects.toMatchObject({code: 'DISPOSED'});
  });

  it('terminates a stuck worker and permits a clean retry', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', TestWorker);
    const service = createScrambleService();
    const result = service.generate('444');
    const rejected = expect(result).rejects.toMatchObject({code: 'GENERATION_FAILED'});
    await vi.advanceTimersByTimeAsync(180_000);
    await rejected;
    expect(TestWorker.created[0].terminate).toHaveBeenCalledOnce();
    const retry = service.generate('444');
    const retryRejected = expect(retry).rejects.toMatchObject({code: 'DISPOSED'});
    expect(TestWorker.created).toHaveLength(2);
    service.dispose();
    await retryRejected;
  });
});
