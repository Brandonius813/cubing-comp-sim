import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'target/table-reference');
const listJava = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(x =>
  x.isDirectory() ? listJava(path.join(dir, x.name)) : x.name.endsWith('.java') ? [path.join(dir, x.name)] : []))).flat();
await mkdir(out, { recursive: true });
const sources = (await Promise.all(['vendor/tnoodle-lib', 'compatibility'].map(dir => listJava(path.join(root, dir))))).flat();
sources.push(path.join(root, 'reference/com/cubingcompsim/engine/FourTableExport.java'));
const argsFile = path.join(root, 'target/table-sources.txt');
await writeFile(argsFile, sources.map(x => `"${x.replaceAll('\\', '\\\\')}"`).join('\n'));
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
run('javac', ['-encoding', 'UTF-8', '-d', out, '@' + argsFile]);
const binary = path.join(root, 'target/four-tables.bin');
run('java', ['-ea', '-Xmx1g', '-cp', out, 'com.cubingcompsim.engine.FourTableExport', binary]);
const bytes = await readFile(binary);
// Upstream Tools.saveTo has a fixed format: Center1.ctsmv then Edge3.eprun.
if (bytes.length !== (15582 * 36 + (1538 * 20160 / 16)) * 4) throw new Error('Unexpected upstream 4x4 table layout.');
const chunks = bytes.toString('base64').match(/.{1,16000}/g);
const target = path.join(root, 'target/generated-sources/com/cubingcompsim/engine/FourTables.java');
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `package com.cubingcompsim.engine;
import java.io.ByteArrayInputStream;
import java.io.DataInputStream;
import java.util.Base64;
final class FourTables {
    private static boolean loaded;
    static synchronized void load() {
        if (loaded) return;
        StringBuilder data = new StringBuilder(${bytes.toString('base64').length});
        ${chunks.map(chunk => `data.append("${chunk}");`).join('\n        ')}
        try {
            cs.min2phase.Search.init();
            cs.threephase.Tools.initFrom(new DataInputStream(new ByteArrayInputStream(Base64.getDecoder().decode(data.toString()))));
            loaded = true;
        } catch (java.io.IOException error) { throw new IllegalStateException("Invalid bundled 4x4 tables", error); }
    }
}
`);
console.log(`Generated deterministic 4x4 table cache: ${bytes.length} bytes, SHA-256 ${createHash('sha256').update(bytes).digest('hex')}.`);
