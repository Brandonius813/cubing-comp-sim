import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LOCALES, type Locale } from '../locales';
import { getAudioPreferences, saveAudioPreferences, subscribeAudioPreferences, type AudioPreferences } from '../audio/preferences';
import { InspectionAudio, selectLocalVoice } from '../audio/inspection';
import { ambiencePlayer, loadAudioCatalog, type AmbienceTrack } from '../audio/ambience';
import { inspectionPhrase, t } from './i18n';
import { Select } from './primitives';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="setting-row"><div><label>{label}</label>{hint && <p>{hint}</p>}</div><div className="setting-control">{children}</div></div>;
}
export function AudioSettings({ locale }: { locale: Locale }) {
  const preferences = useSyncExternalStore(subscribeAudioPreferences, getAudioPreferences, getAudioPreferences);
  const ambience = useSyncExternalStore(ambiencePlayer.subscribe, ambiencePlayer.getSnapshot, ambiencePlayer.getSnapshot);
  const [audio] = useState(() => new InspectionAudio());
  const [voices, setVoices] = useState(() => audio.voices());
  const [tracks, setTracks] = useState<AmbienceTrack[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const previewRequest = useRef(0);
  const voiceLocale = preferences.voiceLanguage === 'follow' ? locale : preferences.voiceLanguage;
  const voiceAvailable = Boolean(selectLocalVoice(voices, voiceLocale));
  const track = tracks.find(item => item.id === preferences.ambienceTrack);
  const playing = ambience.status === 'playing' || ambience.status === 'loading';
  useEffect(() => audio.onVoicesChanged(() => setVoices(audio.voices())), [audio]);
  useEffect(() => () => { previewRequest.current++; audio.dispose(); }, [audio]);
  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener('online', change); window.addEventListener('offline', change);
    return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void loadAudioCatalog(controller.signal).then(value => { setTracks(value.tracks); setCatalogError(false); }).catch(() => { if (!controller.signal.aborted) setCatalogError(true); });
    return () => controller.abort();
  }, [online]);
  const update = (patch: Partial<Omit<AudioPreferences, 'version'>>) => {
    previewRequest.current++; audio.cancel();
    setSaveError(!saveAudioPreferences(patch));
    if (patch.ambienceVolume !== undefined) ambiencePlayer.volume(patch.ambienceVolume);
    if ('ambienceTrack' in patch) ambiencePlayer.pause();
  };
  const preview = () => {
    const request = ++previewRequest.current;
    void audio.prepare().then(() => {
      if (request === previewRequest.current) audio.cue(voiceLocale, inspectionPhrase(voiceLocale, 8), preferences, () => request === previewRequest.current);
    });
  };
  return <>
    {saveError && <p className="error-text" role="alert">{t('saveError')}</p>}
    <Row label={t('voiceLanguage')} hint={t('voiceDeviceHint')}>
      <Select label={t('voiceLanguage')} value={preferences.voiceLanguage} onChange={value => update({ voiceLanguage: value as AudioPreferences['voiceLanguage'] })}
        options={[{ value: 'follow', label: t('followLanguage') }, ...LOCALES.map(item => ({ value: item.id, label: item.nativeName }))]} />
    </Row>
    {!voiceAvailable && <p role="status">{t('voiceUnavailable')}</p>}
    <Row label={t('inspectionVolume')}>
      <input type="range" aria-label={t('inspectionVolume')} min="0" max="1" step="0.05" value={preferences.inspectionVolume} onChange={event => update({ inspectionVolume: Number(event.target.value) })} />
      <button type="button" className="secondary-button" onClick={preview}>{t('testVoice')}</button>
    </Row>
    <h3>{t('ambience')}</h3>
    <p>{t('ambienceOnlineOnly')}</p>
    {tracks.length === 0 ? <p role="status">{catalogError && online ? t('ambienceLoadError') : t('ambienceUnavailable')}</p> : <>
      <Row label={t('ambienceTrack')}>
        <Select label={t('ambienceTrack')} value={track?.id ?? ''} onChange={value => update({ ambienceTrack: value || null })}
          options={[{ value: '', label: t('ambienceOff') }, ...tracks.map(item => ({ value: item.id, label: item.title }))]} />
      </Row>
      <Row label={t('ambienceVolume')}>
        <input type="range" aria-label={t('ambienceVolume')} min="0" max="1" step="0.05" value={preferences.ambienceVolume} onChange={event => update({ ambienceVolume: Number(event.target.value) })} />
        <button type="button" className="secondary-button" disabled={!playing && (!track || !online)} onClick={() => { if (playing) ambiencePlayer.pause(); else if (track) void ambiencePlayer.play(track, preferences.ambienceVolume); }}>{playing ? t('ambiencePause') : t('ambiencePlay')}</button>
      </Row>
      {track && <p><a href={track.sourceUrl} target="_blank" rel="noopener noreferrer">{track.attribution}</a>{' · '}<a href={track.licenseUrl} target="_blank" rel="noopener noreferrer">{track.license}</a></p>}
    </>}
    {(ambience.status === 'offline' || !online) && <p role="status">{t('ambienceOnlineOnly')}</p>}
    {ambience.status === 'error' && <p className="error-text" role="alert">{t('ambienceLoadError')}</p>}
  </>;
}
