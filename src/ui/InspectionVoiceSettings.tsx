import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LOCALES, type Locale } from '../locales';
import { getAudioPreferences, saveAudioPreferences, subscribeAudioPreferences, type AudioPreferences } from '../audio/preferences';
import { InspectionAudio, selectLocalVoice } from '../audio/inspection';
import { inspectionPhrase, t } from './i18n';
import { Select } from './primitives';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="setting-row"><div><label>{label}</label>{hint && <p>{hint}</p>}</div><div className="setting-control">{children}</div></div>;
}
export function InspectionVoiceSettings({ locale }: { locale: Locale }) {
  const preferences = useSyncExternalStore(subscribeAudioPreferences, getAudioPreferences, getAudioPreferences);
  const [audio] = useState(() => new InspectionAudio());
  const [voices, setVoices] = useState(() => audio.voices());
  const [saveError, setSaveError] = useState(false);
  const previewRequest = useRef(0);
  const voiceLocale = preferences.voiceLanguage === 'follow' ? locale : preferences.voiceLanguage;
  const voiceAvailable = Boolean(selectLocalVoice(voices, voiceLocale));
  useEffect(() => audio.onVoicesChanged(() => setVoices(audio.voices())), [audio]);
  useEffect(() => () => { previewRequest.current++; audio.dispose(); }, [audio]);
  const update = (patch: Partial<Pick<AudioPreferences, 'voiceLanguage' | 'inspectionVolume'>>) => {
    previewRequest.current++; audio.cancel();
    setSaveError(!saveAudioPreferences(patch));
  };
  const preview = () => {
    const request = ++previewRequest.current;
    void audio.prepare().then(() => {
      if (request === previewRequest.current) audio.cue(voiceLocale, inspectionPhrase(voiceLocale, 8), preferences, () => request === previewRequest.current);
    });
  };
  return <>
    {saveError && <p className="error-text" role="alert">{t('saveError')}</p>}
    <Row label={t('voiceLanguage')}>
      <Select label={t('voiceLanguage')} value={preferences.voiceLanguage} onChange={value => update({ voiceLanguage: value as AudioPreferences['voiceLanguage'] })}
        options={[{ value: 'follow', label: t('followLanguage') }, ...LOCALES.map(item => ({ value: item.id, label: item.nativeName }))]} />
    </Row>
    {!voiceAvailable && <p role="status">{t('voiceUnavailable')}</p>}
    <Row label={t('inspectionVolume')}>
      <input type="range" aria-label={t('inspectionVolume')} min="0" max="1" step="0.05" value={preferences.inspectionVolume} onChange={event => update({ inspectionVolume: Number(event.target.value) })} />
      <button type="button" className="secondary-button" onClick={preview}>{t('testVoice')}</button>
    </Row>
  </>;
}
