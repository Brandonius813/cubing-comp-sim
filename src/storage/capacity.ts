/**
 * Manual storage-capacity measurement, not a scramble correctness benchmark.
 *
 * Run from the app directory:
 * npx tsc src/storage/capacity.ts --outDir /tmp/cubing-capacity --module commonjs --target es2022 --skipLibCheck
 * node /tmp/cubing-capacity/storage/capacity.js
 *
 * Fixed representative notation is deliberate test data, never an app generator.
 * These measurements are local Node.js observations, not browser/mobile timings.
 */
import type { Attempt, Round } from '../core';
import { MAX_IMPORT_BYTES, validateHistorySnapshot } from './validation';
import type { HistorySnapshot } from './validation';

const attemptTotal = 100_000;
const runtime = (globalThis as typeof globalThis & { process?: { version: string; platform: string; arch: string } }).process;
const attemptsPerRound = 5;
const notation = "D2 R2 F2 U L2 F2 R2 U' R2 B2 D2 F U' R D B2 L' U2 B' L2";
const epoch = 1_700_000_000_000;
const id = (value: number, kind: 'round' | 'attempt') => `${kind === 'round' ? '00000000' : '10000000'}-0000-4000-8000-${String(value).padStart(12, '0')}`;
const rounds: Round[] = [];

for (let roundIndex = 0; roundIndex < attemptTotal / attemptsPerRound; roundIndex++) {
  const roundId = id(roundIndex, 'round');
  const attempts: Attempt[] = [];
  for (let index = 0; index < attemptsPerRound; index++) {
    const sequence = roundIndex * attemptsPerRound + index;
    const recordedAt = epoch + sequence * 30_000;
    attempts.push({
      id: id(sequence, 'attempt'), roundId, index,
      rawMs: 10_000 + sequence % 20_000,
      penalty: sequence % 20 === 0 ? '+2' : 'none', inspectionPenalty: 'none',
      inputMethod: 'timer', recordedAt, inspectionMs: 12_000,
      scramble: { eventId: '333', notation, engineVersion: 'tnoodle-lib@capacity-fixture-not-generated', generatedAt: recordedAt - 30_000 },
    });
  }
  rounds.push({ id: roundId, eventId: '333', format: 'ao5', attempts, createdAt: attempts[0].recordedAt - 60_000, updatedAt: attempts[4].recordedAt, completedAt: attempts[4].recordedAt, goalMs: 20_000 });
}

const data: HistorySnapshot = { app: 'cubing-comp-sim', schemaVersion: 1, exportedAt: epoch + attemptTotal * 30_000, rounds, activeRoundId: rounds.at(-1)!.id };
const serializeStart = performance.now();
const json = JSON.stringify(data);
const serializationMs = performance.now() - serializeStart;
const bytes = new TextEncoder().encode(json).byteLength;
const parseStart = performance.now();
const parsed: unknown = JSON.parse(json);
const parseMs = performance.now() - parseStart;
const validationStart = performance.now();
const checked = validateHistorySnapshot(parsed);
const validationMs = performance.now() - validationStart;
const checkedCount = checked.rounds.reduce((count, round) => count + round.attempts.length, 0);
if (checkedCount !== attemptTotal || checked.rounds.some(round => round.attempts.some(attempt => 'svg' in attempt.scramble))) {
  throw new Error('Capacity fixture failed structural validation.');
}

console.log(JSON.stringify({
  runtime: runtime ? `Node ${runtime.version}` : 'Unknown JavaScript runtime', platform: runtime?.platform, architecture: runtime?.arch,
  attempts: checkedCount, rounds: checked.rounds.length, serializedBytes: bytes,
  serializedMiB: Number((bytes / 1024 / 1024).toFixed(2)), bytesPerAttemptIncludingRounds: Number((bytes / checkedCount).toFixed(2)),
  serializationMs: Number(serializationMs.toFixed(2)), parseMs: Number(parseMs.toFixed(2)), validationMs: Number(validationMs.toFixed(2)),
  parseAndValidationMs: Number((parseMs + validationMs).toFixed(2)), withinImportLimit: bytes <= MAX_IMPORT_BYTES,
  caveats: 'Fixed representative 3×3 notation; excludes actual generation, SVG drawing, IndexedDB, browser UI, compression and mobile performance. One local run, not a latency guarantee.',
}, null, 2));
