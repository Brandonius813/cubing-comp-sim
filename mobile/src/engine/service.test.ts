import vm from 'node:vm';
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
    assert.equal(f.statuses[0], 'loading');
    assert.ok(f.statuses.slice(1).every(status => status === 'ready'));
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


test('cancelled queued work never enters the engine and active cancellation discards only its result', async () => {
  const f = fixture(); f.ready();
  try {
    const active = new AbortController(); const queued = new AbortController();
    const first = f.service.generate('444', { signal: active.signal });
    const second = f.service.generate('222', { signal: queued.signal });
    const firstRejected = assert.rejects(first, /cancelled/);
    const secondRejected = assert.rejects(second, /cancelled/);
    queued.abort(); active.abort();
    await Promise.all([firstRejected, secondRejected]);
    const third = f.service.generate('333');
    assert.equal(f.sent.length, 1);
    f.binding.receive(f.result(1, '444'));
    assert.equal(f.sent.length, 2);
    f.binding.receive(f.result(3));
    assert.equal((await third).eventId, '333');
    await assert.rejects(f.service.generate('333', { signal: active.signal }), /cancelled/);
    assert.equal(f.sent.length, 2);
  } finally { f.service.dispose(); }
});

test('stale request failures cannot kill a newer request', async () => {
  const f = fixture(); f.ready();
  try {
    const pending = f.service.generate('333');
    f.binding.receive(JSON.stringify({ version: 1, channel: f.binding.channel, type: 'error', id: 999, code: 'GENERATION_FAILED' }));
    assert.equal(f.statuses.at(-1), 'ready');
    f.binding.receive(f.result(1)); await pending;
  } finally { f.service.dispose(); }
});

test('progress uses a monotonic elapsed duration and clears after completion', async () => {
  const service = new MobileScrambleService();
  const updates: import('./protocol').EngineStatus[] = [];
  const binding = service.bind(version, () => {}, value => updates.push(value));
  try {
    binding.receive(JSON.stringify({ version: 1, channel: binding.channel, type: 'ready', engineVersion: version, events: SCRAMBLE_EVENTS }));
    const pending = service.generate('444');
    assert.equal(updates.at(-1)?.generation?.eventId, '444');
    assert.ok(updates.at(-1)!.generation!.elapsedMs >= 0);
    binding.receive(JSON.stringify({ version: 1, channel: binding.channel, type: 'result', id: 1, durationMs: 5,
      scramble: { eventId: '444', notation: 'R', svg: '<svg></svg>', engineVersion: version, generatedAt: 1 } }));
    await pending;
    assert.equal(updates.at(-1)?.generation, undefined);
  } finally { service.dispose(); }
});

test('queue is bounded and cancelling a queued request frees its slot', async () => {
  const f = fixture(); f.ready();
  const controller = new AbortController();
  const requests = [f.service.generate('333')];
  requests.push(f.service.generate('333', { signal: controller.signal }));
  for (let i = 0; i < 7; i++) requests.push(f.service.generate('333'));
  const settled = Promise.allSettled(requests);
  await assert.rejects(f.service.generate('333'), /Too many/);
  controller.abort();
  const replacement = f.service.generate('222');
  const replacementRejected = assert.rejects(replacement, /closed/);
  f.service.dispose();
  assert.ok((await settled).every(result => result.status === 'rejected'));
  await replacementRejected;
});

test('boot timeout rejects queued requests and late readiness cannot revive a failed host', async () => {
  const f = fixture({ bootTimeoutMs: 5 });
  await assert.rejects(f.service.generate('333'), /stopped/);
  f.ready();
  assert.equal(f.statuses.at(-1), 'error');
  await assert.rejects(f.service.generate('333'), /not ready/);
  f.service.dispose();
});

test('historical drawing requests retain exact notation and do not generate replacement scrambles', async () => {
  const f=fixture(); f.ready();
  try { const pending=f.service.draw('333', "R U R'"); assert.match(f.sent[0],/"notation":"R U R'"/); f.binding.receive(f.result(1)); assert.equal(await pending,'<svg></svg>'); }
  finally {f.service.dispose();}
});
test('invalid historical notation fails only that drawing, not the generation host',async()=>{
 const f=fixture();f.ready();try{
  const drawing=f.service.draw('333','not a scramble');const rejected=assert.rejects(drawing,/Could not draw/);const next=f.service.generate('222');
  f.binding.receive(JSON.stringify({version:1,channel:f.binding.channel,type:'error',id:1,code:'GENERATION_FAILED'}));await rejected;
  f.binding.receive(f.result(2,'222'));assert.equal((await next).eventId,'222');
 }finally{f.service.dispose();}
});

test('drawing notation is passed as data, never evaluated as script',()=>{
 const notation='R\"; globalThis.injected = true; //';
 let received:unknown;const context=vm.createContext({__ccsEngineReceive:(request:unknown)=>{received=request}});
 vm.runInContext(requestScript({version:1,channel:'safe',type:'generate',id:1,eventId:'333',notation}),context);
 assert.equal((received as {notation:string}).notation,notation);assert.equal(context.injected,undefined);
});
