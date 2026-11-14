import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomFillSync } from 'node:crypto';
import { installNativeCrypto } from './native-crypto';

test('native crypto adapter supplies secure random values and SHA-256 without replacing existing APIs', async () => {
  const target = {} as { crypto: Crypto };
  const uuid = 'verified-native-uuid';
  installNativeCrypto(target, {
    randomUUID: () => uuid,
    getRandomValues: array => randomFillSync(array),
    digest: async data => {
      const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      return Uint8Array.from(createHash('sha256').update(bytes).digest()).buffer;
    },
  });
  assert.equal(target.crypto.randomUUID(), uuid);
  const values = new Uint32Array(56);
  assert.equal(target.crypto.getRandomValues(values), values);
  assert.ok(values.some(value => value !== 0));
  const hash = await target.crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc'));
  assert.equal(Buffer.from(hash).toString('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  await assert.rejects(target.crypto.subtle.digest('SHA-1', new Uint8Array()), /SHA-256 only/);
  const original = target.crypto.getRandomValues;
  installNativeCrypto(target, { randomUUID: () => 'wrong', getRandomValues: () => { throw new Error('wrong'); }, digest: async () => { throw new Error('wrong'); } });
  assert.equal(target.crypto.getRandomValues, original);
});
