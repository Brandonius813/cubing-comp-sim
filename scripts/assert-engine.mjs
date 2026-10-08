import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

try {
  const manifest = JSON.parse(await readFile('public/engine/manifest.json', 'utf8'));
  const lock = JSON.parse(await readFile('engine/upstream-lock.json', 'utf8'));
  const bytes = await readFile('public/engine/tnoodle.js');
  if (manifest.upstreamCommit !== lock.commit || manifest.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
    throw new Error('Engine provenance or integrity does not match the pinned source.');
  }
  await readFile('public/engine/LICENSE.txt');
  const proof = JSON.parse(await readFile('public/engine/conformance.json', 'utf8'));
  const events = ['222','333','444','555','666','777','333oh','333bf','444bf','555bf','minx','pyram','skewb','sq1','fto','clock'];
  if (proof.schemaVersion !== 1 || proof.outcome !== 'passed' || proof.engineVersion !== manifest.engineVersion
    || proof.engineSha256 !== manifest.sha256 || proof.sourceCommit !== lock.commit
    || !events.every(id => proof.liveEvents?.includes(id) && proof.cases?.some(value => value.eventId === id))) {
    throw new Error('The local engine has not passed reference comparisons for every supported event.');
  }
  console.log('Local engine artifact integrity verified.');
} catch (error) {
  console.error('Production build blocked: build and verify the local TNoodle engine first.');
  console.error(error.message);
  process.exit(1);
}
