import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'target/reference');
const listJava = dir => readdirSync(dir, {withFileTypes: true}).flatMap(x =>
  x.isDirectory() ? listJava(path.join(dir, x.name)) : x.name.endsWith('.java') ? [path.join(dir, x.name)] : []);
mkdirSync(out, {recursive: true});
const args = listJava(path.join(root, 'vendor/tnoodle-lib'))
  .concat(listJava(path.join(root, 'compatibility')), listJava(path.join(root, 'java')), listJava(path.join(root, 'reference')));
const argsFile = path.join(root, 'target/reference-sources.txt');
writeFileSync(argsFile, args.map(x => `"${x.replaceAll('\\', '\\\\')}"`).join('\n'));
function run(command, args, stdio = 'inherit') {
  const result = spawnSync(command, args, {stdio});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
run(process.execPath, [path.join(root, 'scripts/verify-vendor.mjs')]);
run('javac', ['-encoding', 'UTF-8', '-d', out, '@' + argsFile]);
const fixtures = path.join(root, 'target/reference-fixtures.jsonl');
const handle = openSync(fixtures, 'w');
try {
  run('java', ['-ea', '-Xmx1g', '-cp', out, 'com.cubingcompsim.engine.Reference', process.argv[2] ?? '1'], ['ignore', handle, 'inherit']);
} finally {
  closeSync(handle);
}
console.log(`Reference fixtures: ${fixtures}`);
