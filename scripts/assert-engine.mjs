import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const events = ['222', '333', '444', '555', '666', '777', '333oh', '333bf',
  '444bf', '555bf', 'minx', 'pyram', 'skewb', 'sq1', 'fto', 'clock'];

export function verifyEngineArtifact({manifest, proof, lock, bytes}) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (manifest.schemaVersion !== 1 || manifest.upstreamCommit !== lock.commit || manifest.sha256 !== sha256) {
    throw new Error('Engine provenance or integrity does not match the pinned source.');
  }
  if (proof.schemaVersion !== 1 || proof.outcome !== 'passed' || proof.engineVersion !== manifest.engineVersion
    || proof.engineSha256 !== sha256 || proof.upstreamCommit !== lock.commit
    || proof.sourceCommit !== manifest.sourceCommit) {
    throw new Error('Conformance proof does not match the compiled engine and its source identities.');
  }
  // CI sourceCommit identifies the app/adapters. upstreamCommit identifies TNoodle.
  // Local builds have no CI commit and explicitly record null in both documents.
  if (!(manifest.sourceCommit === null || /^[a-f0-9]{40}$/.test(manifest.sourceCommit ?? ''))) {
    throw new Error('Application source commit is missing or invalid.');
  }
  if (manifest.sourceCommit && !manifest.source.includes('/tree/' + manifest.sourceCommit + '/engine')) {
    throw new Error('Corresponding-source URL does not identify the compiled application commit.');
  }
  if (!Array.isArray(proof.liveEvents) || proof.liveEvents.length !== events.length
    || new Set(proof.liveEvents).size !== events.length || !events.every(id => proof.liveEvents.includes(id))
    || !Array.isArray(proof.cases)
    || !events.every(id => new Set(proof.cases.filter(value => value.eventId === id && Number.isInteger(value.seed))
      .map(value => value.seed)).size >= 2)) {
    throw new Error('Every supported event needs live generation and two distinct reference fixtures.');
  }
  if (!/^[a-f0-9]{64}$/.test(proof.referenceSha256 ?? '')) {
    throw new Error('Reference fixture checksum is missing.');
  }
}

async function main() {
  try {
    const manifest = JSON.parse(await readFile('public/engine/manifest.json', 'utf8'));
    const proof = JSON.parse(await readFile('public/engine/conformance.json', 'utf8'));
    const lock = JSON.parse(await readFile('engine/upstream-lock.json', 'utf8'));
    const bytes = await readFile('public/engine/tnoodle.js');
    verifyEngineArtifact({manifest, proof, lock, bytes});
    await readFile('public/engine/LICENSE.txt');
    console.log('Local engine artifact and matching conformance proof verified.');
  } catch (error) {
    console.error('Production build blocked: build and verify the local TNoodle engine first.');
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
