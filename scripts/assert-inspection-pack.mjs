import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../public/audio/inspection/v1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
const locales = ['en','es','fr','de','pl','it','pt-BR','nl','ru','uk','tr','ja','zh-Hans','zh-Hant','ko','id'];
const slots = ['male-1','male-2','female-1','female-2'];
assert.equal(manifest.clips.length, 128);
const expected = new Set(locales.flatMap(locale => slots.flatMap(slot => [8,12].map(seconds => `${locale}/${slot}-${seconds}.mp3`))));
for (const clip of manifest.clips) {
  assert.ok(expected.delete(clip.file), `Unexpected or duplicate clip: ${clip.file}`);
  assert.ok(clip.voiceId && clip.speaker && clip.generationId && clip.phrase);
  assert.ok(clip.durationSeconds >= 0.25 && clip.durationSeconds <= 3, `Unexpected duration: ${clip.file}`);
  const bytes = await readFile(new URL(clip.file, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256, `Changed clip: ${clip.file}`);
  assert.equal(bytes.length, clip.bytes);
  assert.ok(bytes.length > 1000);
}
assert.equal(expected.size, 0);
for (const locale of locales) assert.equal((await readdir(new URL(`${locale}/`, root))).length, 8);
console.log('All 128 inspection recordings, speaker metadata and checksums verified.');
