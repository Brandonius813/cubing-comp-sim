import { describe, expect, it, vi } from 'vitest';
import { AmbiencePlayer, validateAudioCatalog, type AmbienceTrack } from './ambience';
const origin = 'https://cubingcompsim.com';
const fixture = {
  id: 'test-hall', title: 'Test hall', url: '/audio/background/test-hall.mp3', durationSeconds: 600,
  attribution: 'Test fixture author', sourceUrl: 'https://example.org/source',
  license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
};
const track: AmbienceTrack = { ...fixture, url: origin + fixture.url };
describe('audio catalog trust boundary', () => {
  it('accepts an empty catalog and valid attributed long tracks', () => {
    expect(validateAudioCatalog({ version: 1, tracks: [] }, origin).tracks).toEqual([]);
    expect(validateAudioCatalog({ version: 1, tracks: [fixture] }, origin).tracks[0]).toEqual(track);
  });
  it('rejects injected, credentialed, private and non-audio same-origin URLs', () => {
    for (const url of ['javascript:alert(1)', 'http://example.org/file.mp3', 'https://user:secret@example.org/a.mp3', 'https://127.0.0.1/a.mp3', '/api/save', 'https://files.example.org/a.mp3?token=secret']) {
      expect(() => validateAudioCatalog({ version: 1, tracks: [{ ...fixture, url }] }, origin)).toThrow();
    }
  });
  it('rejects unversioned, duplicate, too-short and unattributed assets', () => {
    for (const catalog of [
      { tracks: [fixture] }, { version: 1, tracks: [fixture, fixture] },
      { version: 1, tracks: [{ ...fixture, durationSeconds: 5 }] },
      { version: 1, tracks: [{ ...fixture, attribution: '' }] },
    ]) expect(() => validateAudioCatalog(catalog, origin)).toThrow();
  });
});
function setup() {
  let online = true;
  const audio = { preload: '', loop: false, volume: 1, src: '', pause: vi.fn(), play: vi.fn(async (): Promise<void> => undefined), onerror: null as (() => void) | null };
  const createAudio = vi.fn(() => audio as unknown as HTMLAudioElement);
  const player = new AmbiencePlayer(createAudio, () => online);
  return { player, audio, createAudio, setOnline: (value: boolean) => { online = value; } };
}
describe('explicit streamed ambience', () => {
  it('does not fetch media or autoplay when created; explicit play enables looping', async () => {
    const { player, audio, createAudio } = setup();
    expect(createAudio).not.toHaveBeenCalled();
    await player.play(track, 0.25);
    expect(audio.preload).toBe('none');
    expect(audio.loop).toBe(true);
    expect(audio.src).toBe(track.url);
    expect(audio.volume).toBe(0.25);
    expect(player.getSnapshot().status).toBe('playing');
    player.pause();
    expect(player.getSnapshot().status).toBe('paused');
  });
  it('preserves working buffered playback when the network hint becomes offline', async () => {
    const { player, audio, setOnline } = setup();
    await player.play(track, 0.25);
    const calls = audio.pause.mock.calls.length;
    setOnline(false); player.offline();
    expect(player.getSnapshot().status).toBe('playing');
    expect(audio.pause.mock.calls.length).toBe(calls);
    audio.onerror?.();
    expect(player.getSnapshot().status).toBe('error');
  });
  it('blocks a fresh offline stream and never auto-resumes on reconnection', async () => {
    const { player, audio, createAudio, setOnline } = setup();
    setOnline(false);
    await player.play(track, 0.25);
    expect(createAudio).not.toHaveBeenCalled();
    expect(player.getSnapshot().status).toBe('offline');
    setOnline(true); player.online();
    expect(player.getSnapshot().status).toBe('paused');
    expect(audio.play).not.toHaveBeenCalled();
  });
  it('handles autoplay denial without throwing into the simulator', async () => {
    const { player, audio } = setup();
    audio.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    await expect(player.play(track, 0.25)).resolves.toBeUndefined();
    expect(player.getSnapshot().status).toBe('error');
  });
  it('does not restart after pause while a play promise is pending', async () => {
    const { player, audio } = setup();
    let resolve!: () => void;
    audio.play.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    const pending = player.play(track, 0.25);
    player.pause(); resolve(); await pending;
    expect(player.getSnapshot().status).toBe('paused');
  });
});
