import assert from 'node:assert/strict';
import test from 'node:test';
import { InspectionCueClock, InspectionPlayback, type InspectionPlayer } from './audio/cues';

test('callouts are once each at 8 and 12 seconds, based on elapsed time', () => {
  const clock = new InspectionCueClock(100);
  const cues: number[] = [];
  const play = (cue: number) => { cues.push(cue); return true; };
  for (const now of [100, 8099, 8100, 8101, 12099, 12100, 12101]) clock.tick(now, play);
  assert.deepEqual(cues, [8, 12]);
});
test('late or unavailable callouts never play after their grace period', () => {
  const clock = new InspectionCueClock(0);
  let requests = 0;
  clock.tick(8000, () => { requests++; return false; });
  clock.tick(8501, () => { requests++; return true; });
  clock.tick(14000, () => { requests++; return true; });
  assert.equal(requests, 1);
});
test('an unloaded clip can become ready within the bounded grace period', () => {
  const clock = new InspectionCueClock(0);
  const played: number[] = [];
  clock.tick(8000, () => false);
  clock.tick(8250, cue => { played.push(cue); return true; });
  clock.tick(8300, cue => { played.push(cue); return true; });
  assert.deepEqual(played, [8]);
});
function player(): InspectionPlayer & { plays: number; pauses: number; releases: number } {
  return { isLoaded: true, volume: 0, plays: 0, pauses: 0, releases: 0,
    play() { this.plays++; }, pause() { this.pauses++; }, release() { this.releases++; } };
}
test('stop cancels future cues and releases both players', () => {
  const playback = new InspectionPlayback();
  const eight = player(), twelve = player();
  playback.prepare({ 8: eight, 12: twelve }, 0.8);
  playback.start(0); playback.tick(8000); playback.stop(); playback.tick(12000);
  assert.equal(eight.plays, 1); assert.equal(twelve.plays, 0);
  assert.equal(eight.releases, 1); assert.equal(twelve.releases, 1);
  assert.equal(eight.volume, 0.8);
});
test('mute remains silent and new inspection disposes old players', () => {
  const playback = new InspectionPlayback();
  const old = { 8: player(), 12: player() };
  playback.prepare(old, 0); playback.start(0); playback.tick(8000);
  assert.equal(old[8].plays, 0);
  const next = { 8: player(), 12: player() };
  playback.prepare(next, 1); playback.start(10000); playback.tick(12000);
  assert.equal(old[12].releases, 1); assert.equal(next[12].plays, 0);
  playback.tick(18000); assert.equal(next[8].plays, 1);
});


test('every native audio reference resolves to a real bundled recording', async () => {
  const { readFile, stat } = await import('node:fs/promises');
  const { URL } = await import('node:url');
  const assetMap = new URL('./audio/assets.ts', import.meta.url);
  const source = await readFile(assetMap, 'utf8');
  const paths = [...source.matchAll(/require\("([^"]+)"\)/g)].map(match => match[1]);
  assert.equal(paths.length, 128);
  assert.equal(new Set(paths).size, 128);
  for (const path of paths) {
    assert.ok(path.startsWith('../../../public/audio/inspection/v1/'));
    assert.ok((await stat(new URL(path, assetMap))).size > 0);
  }
});
