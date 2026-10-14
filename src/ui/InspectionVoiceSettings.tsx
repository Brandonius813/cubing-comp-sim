import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { LOCALES, type Locale } from '../locales';
import { getAudioPreferences, saveAudioPreferences, subscribeAudioPreferences, selectedInspectionVoice, type AudioPreferences } from '../audio/preferences';
import { InspectionAudio } from '../audio/inspection';
import { t } from './i18n';
import { Select } from './primitives';
import { INSPECTION_VOICES, type InspectionVoice } from '../audio/voices';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="setting-row"><div><label>{label}</label>{hint && <p>{hint}</p>}</div><div className="setting-control">{children}</div></div>;
}
export function InspectionVoiceSettings({ locale }: { locale: Locale }) {
  const preferences = useSyncExternalStore(subscribeAudioPreferences, getAudioPreferences, getAudioPreferences);
  const [audio] = useState(() => new InspectionAudio());
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const previewRequest = useRef(0);
  const voiceLocale = preferences.voiceLanguage === 'follow' ? locale : preferences.voiceLanguage;
  const selectedVoice = selectedInspectionVoice(preferences, voiceLocale);
  useEffect(() => { previewRequest.current++; audio.cancel(); setVoiceUnavailable(false); }, [audio, voiceLocale, selectedVoice, preferences.inspectionVolume]);
  useEffect(() => () => { previewRequest.current++; audio.dispose(); }, [audio]);
  const update = (patch: Partial<Pick<AudioPreferences, 'voiceLanguage' | 'inspectionVolume' | 'inspectionVoices'>>) => {
    previewRequest.current++; audio.cancel(); setVoiceUnavailable(false);
    setSaveError(!saveAudioPreferences(patch));
  };
  const preview = () => {
    const request = ++previewRequest.current;
    void audio.prepare(voiceLocale, preferences).then(async ready => {
      if (request !== previewRequest.current) return;
      const result = ready ? await audio.cue(voiceLocale, 8, preferences, () => request === previewRequest.current) : 'unavailable';
      if (request === previewRequest.current) setVoiceUnavailable(result === 'unavailable');
    });
  };
  return <>
    {saveError && <p className="error-text" role="alert">{t('saveError')}</p>}
    <Row label={t('voiceLanguage')}>
      <Select label={t('voiceLanguage')} value={preferences.voiceLanguage} onChange={value => update({ voiceLanguage: value as AudioPreferences['voiceLanguage'] })}
        options={[{ value: 'follow', label: t('followLanguage') }, ...LOCALES.map(item => ({ value: item.id, label: item.nativeName }))]} />
    </Row>
    <Row label={t('inspectionVoice')}>
      <Select label={t('inspectionVoice')} value={selectedVoice}
        onChange={value => update({ inspectionVoices: { ...preferences.inspectionVoices, [voiceLocale]: value as InspectionVoice } })}
        options={INSPECTION_VOICES.map((value, index) => ({ value, label: t((['maleVoice1', 'maleVoice2', 'femaleVoice1', 'femaleVoice2'] as const)[index]) }))} />
    </Row>
    {voiceUnavailable && <p role="status">{t('voiceUnavailable')}</p>}
    <Row label={t('inspectionVolume')}>
      <input type="range" aria-label={t('inspectionVolume')} min="0" max="1" step="0.05" value={preferences.inspectionVolume} onChange={event => update({ inspectionVolume: Number(event.target.value) })} />
      <button type="button" className="secondary-button" onClick={preview}>{t('testVoice')}</button>
    </Row>
  </>;
}
