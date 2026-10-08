import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { verifyEngineArtifact } from './assert-engine.mjs';

function fixture() {
  const bytes = Buffer.from('test-only compiled artifact fixture');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const upstreamCommit = 'a'.repeat(40);
  const sourceCommit = 'b'.repeat(40);
  const engineVersion = 'test-engine-version';
  const liveEvents = ['222', '333', '444', '555', '666', '777', '333oh', '333bf',
    '444bf', '555bf', 'minx', 'pyram', 'skewb', 'sq1', 'fto', 'clock'];
  return {
    bytes,
    lock: {commit: upstreamCommit},
    manifest: {schemaVersion: 1, upstreamCommit, sourceCommit, engineVersion, sha256,
      source: 'https://github.com/Brandonius813/cubing-comp-sim/tree/' + sourceCommit + '/engine'},
    proof: {schemaVersion: 1, upstreamCommit, sourceCommit, engineVersion, engineSha256: sha256,
      referenceSha256: 'c'.repeat(64), outcome: 'passed', liveEvents,
      cases: liveEvents.flatMap(eventId => [{eventId, seed: 74013}, {eventId, seed: 74014}])},
  };
}

test('accepts matching proof with distinct application and upstream source commits', () => {
  assert.doesNotThrow(() => verifyEngineArtifact(fixture()));
});

test('rejects altered bytes, swapped source identities, mismatched versions and failed proofs', () => {
  for (const mutate of [
    value => {value.bytes = Buffer.from('changed');},
    value => {value.proof.sourceCommit = value.lock.commit;},
    value => {value.proof.upstreamCommit = value.manifest.sourceCommit;},
    value => {value.proof.engineVersion = 'another-version';},
    value => {value.proof.outcome = 'failed';},
    value => {value.manifest.source = 'https://github.com/Brandonius813/cubing-comp-sim/tree/main/engine';},
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => verifyEngineArtifact(value));
  }
});

test('rejects missing live events and insufficient or duplicate seeded fixtures', () => {
  for (const mutate of [
    value => {value.proof.liveEvents.pop();},
    value => {value.proof.cases = value.proof.cases.filter(x => x.eventId !== 'fto');},
    value => {value.proof.cases = value.proof.cases.map(x => ({...x, seed: 74013}));},
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => verifyEngineArtifact(value));
  }
});

test('local provenance must explicitly agree on absence of a CI commit', () => {
  const value = fixture();
  value.manifest.sourceCommit = null;
  value.proof.sourceCommit = null;
  assert.doesNotThrow(() => verifyEngineArtifact(value));
  delete value.proof.sourceCommit;
  assert.throws(() => verifyEngineArtifact(value));
});
