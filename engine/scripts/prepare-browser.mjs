import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import './verify-vendor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'target/generated-sources');
await rm(destination, {recursive: true, force: true});
const lock = JSON.parse(await readFile(path.join(root, 'upstream-lock.json'), 'utf8'));
const edgePath = 'threephase/src/main/java/cs/threephase/Edge3.java';
let edgePatched = 0;
const puzzlePath = 'scrambles/src/main/java/org/worldcubeassociation/tnoodle/scrambles/Puzzle.java';
const originalFactory = /    public static final SecureRandom getSecureRandom\(\) \{[\s\S]*?\n    \}\n/;
let patched = 0;
for (const item of lock.files.filter(x => x.path.endsWith('.java'))) {
  let source = await readFile(path.join(root, 'vendor/tnoodle-lib', item.path), 'utf8');
  if (item.path === puzzlePath) {
    if (!source.includes('SecureRandom.getInstance("SHA1PRNG", "SUN")') || !originalFactory.test(source)) {
      throw new Error('The reviewed SecureRandom platform patch no longer matches upstream.');
    }
    source = source.replace(originalFactory,
      '    // Cubing Comp Sim browser adapter: TeaVM SecureRandom uses WebCrypto.\n' +
      '    public static final SecureRandom getSecureRandom() {\n' +
      '        return new SecureRandom();\n' +
      '    }\n');
    patched++;
  }
  if (item.path === edgePath) {
    const flag = 'static final boolean IS_64BIT_PLATFORM = true;';
    if (source.split(flag).length !== 2 || !source.includes('//long is not as fast as expected')) {
      throw new Error('The reviewed upstream 32-bit Edge3 path no longer matches.');
    }
    // TeaVM represents Java long with BigInt. Select TNoodle's existing int
    // implementation of the same coordinate math for this JavaScript target.
    source = source.replace(flag, 'static final boolean IS_64BIT_PLATFORM = false;');
    edgePatched++;
  }
  const relative = item.path.split('/src/main/java/')[1];
  const file = path.join(destination, relative);
  await mkdir(path.dirname(file), {recursive: true});
  await writeFile(file, source);
}
if (patched !== 1 || edgePatched !== 1) throw new Error('Expected both reviewed browser platform adaptations.');
async function copyTree(from, relative = '') {
  for (const entry of await readdir(path.join(from, relative), {withFileTypes: true})) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) await copyTree(from, child);
    else if (entry.name.endsWith('.java')) {
      const out = path.join(destination, child);
      await mkdir(path.dirname(out), {recursive: true});
      await writeFile(out, await readFile(path.join(from, child)));
    }
  }
}
for (const dir of ['compatibility', 'java', 'browser']) await copyTree(path.join(root, dir));
console.log('Prepared browser sources. Entropy-provider adaptation and upstream 32-bit edge-coordinate path; sampling, search and SVG unchanged.');
