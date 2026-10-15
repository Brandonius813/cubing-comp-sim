import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCRAMBLE_EVENTS } from '../../../src/scramble/types';
import { parseEngineResponse, requestScript } from './protocol';
import { MobileScrambleService } from './service';

const version = 'verified-engine';
function fixture(options = {}) {
  const sent: string[] = [];
  const statuses: string[] = [];
  const service = new MobileScrambleService(options);
  const binding = service.bind(version, script => sent.push(script), status => statuses.push(status.phase));
  const ready = () => binding.receive(JSON.stringify({ version: 1, channel: binding.channel, type: 'ready', engineVersion: version, events: SCRAMBLE_EVENTS }));
  const result = (id: number, eventId = '333') => JSON.stringify({ version: 1, channel: binding.channel, type: 'result', id, durationMs: 4,
    scramble: { eventId, notation: "R U R'", svg: '<svg></svg>', engineVersion: version, generatedAt: 123 } });
  return { service, binding, ready, result, sent, statuses };
}

test('waits for exact engine readiness, serializes jobs and matches results to requests', async () => {
  const f = fixture();
  try {
    const first = f.service.generate('333');
    const second = f.service.generate('222');
    assert.equal(f.sent.length, 0);
    f.ready(); assert.equal(f.sent.length, 1);
    // Unknown response IDs and retired runtime channels cannot resolve a request.
    f.binding.receive(f.result(999));
    f.binding.receive(f.result(1).replace(f.binding.channel, 'retired'));
    assert.equal(f.sent.length, 1);
    f.binding.receive(f.result(1));
    assert.equal((await first).eventId, '333'); assert.equal(f.sent.length, 2);
    f.binding.receive(f.result(2, '222'));
    assert.equal((await second).eventId, '222');
    assert.deepEqual(f.statuses, ['loading', 'ready']);
  } finally { f.service.dispose(); }
});

test('wrong event fails the runtime and rejects both active and queued work', async () => {
  const f = fixture(); f.ready();
  const pending = Promise.allSettled([f.service.generate('333'), f.service.generate('222')]);
  f.binding.receive(f.result(1, '444'));
  assert.ok((await pending).every(result => result.status === 'rejected'));
  assert.equal(f.statuses.at(-1), 'error');
  await assert.rejects(f.service.generate('333'), /not ready/);
  f.service.dispose();
});

test('generation timeout rejects work and a new host can retry without accepting stale results', async () => {
  const f = fixture({ generationTimeoutMs: 5 }); f.ready();
  await assert.rejects(f.service.generate('333'), /stopped/);
  const newBinding = f.service.bind(version, () => {}, () => {});
  newBinding.receive(JSON.stringify({ version: 1, channel: newBinding.channel, type: 'ready', engineVersion: version, events: SCRAMBLE_EVENTS }));
  const retry = f.service.generate('333');
  f.binding.receive(f.result(1));
  newBinding.receive(f.result(2).replace(f.binding.channel, newBinding.channel));
  assert.equal((await retry).eventId, '333');
  f.service.dispose();
});

test('closing a host rejects pending work and unsupported events never reach the bridge', async () => {
  const f = fixture();
  await assert.rejects(f.service.generate('333fm'), /not supported/);
  const pending = f.service.generate('333');
  const rejection = assert.rejects(pending, /closed/);
  f.binding.dispose(); await rejection;
  assert.equal(f.sent.length, 0); f.service.dispose();
});

test('protocol rejects truncated results, mismatched engine identity and executable input', () => {
  assert.throws(() => parseEngineResponse('{', 'host', version));
  assert.throws(() => parseEngineResponse(JSON.stringify({ version: 1, channel: 'host', type: 'ready', engineVersion: 'other', events: SCRAMBLE_EVENTS }), 'host', version));
  assert.throws(() => requestScript({ version: 1, channel: 'host', type: 'generate', id: 1, eventId: "333');alert(1)" }));
  assert.throws(() => requestScript({ version: 1, channel: 'host);alert(1)', type: 'generate', id: 1, eventId: '333' }));
});
