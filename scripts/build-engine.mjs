import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public/engine');
// Recompilation invalidates any earlier proof, even if compilation later fails.
await rm(path.join(out, 'conformance.json'), {force: true});
function run(command, args) {
  const result = spawnSync(command, args, {cwd: root, stdio: 'inherit'});
  if (result.error) throw new Error(`Cannot run ${command}. Install JDK 17+ and Maven 3.9+ first. ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}; no engine was published.`);
}
run(process.execPath, ['engine/scripts/prepare-browser.mjs']);
run('mvn', ['-B', '-f', 'engine/pom.xml', 'package']);
const generated = path.join(root, 'engine/target/browser/tnoodle.js');
const bytes = await readFile(generated);
if (bytes.length < 1000) throw new Error('Generated engine is unexpectedly small.');
const lock = JSON.parse(await readFile(path.join(root, 'engine/upstream-lock.json'), 'utf8'));
await mkdir(out, {recursive: true});
await copyFile(generated, path.join(out, 'tnoodle.js'));
await copyFile(path.join(root, 'engine/vendor/tnoodle-lib/LICENSE'), path.join(out, 'LICENSE.txt'));
await writeFile(path.join(out, 'manifest.json'), JSON.stringify({
  schemaVersion: 1,
  engineVersion: `tnoodle-lib@${lock.commit}+webcrypto.2`,
  upstreamCommit: lock.commit,
  compiler: 'TeaVM 0.16.0',
  sha256: createHash('sha256').update(bytes).digest('hex'),
  source: `https://github.com/Brandonius813/cubing-comp-sim/tree/${process.env.GITHUB_SHA || 'feat/desktop-web-foundation'}/engine`,
  license: 'GPL-3.0',
}, null, 2) + '\n');
console.log('Engine built locally in public/engine. Run JVM/browser conformance before release.');
