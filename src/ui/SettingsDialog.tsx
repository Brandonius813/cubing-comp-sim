import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, FONT_OPTIONS, isShortcutCode, type Settings } from '../storage';
import { registerOfflineSupport, type OfflineStatus } from '../platform/offline';
import { Dialog, Select, Toggle } from './primitives';
import { t } from './i18n';
import { LOCALES } from '../locales';
import { AudioSettings } from './AudioSettings';
import { DEFAULT_AUDIO_PREFERENCES, saveAudioPreferences } from '../audio/preferences';
import { ambiencePlayer } from '../audio/ambience';
import { telemetry } from '../telemetry';
import { loadMetricsConsent, saveMetricsConsent } from './metricsConsent';
import '../styles/settings.css';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="setting-row"><div><span>{label}</span>{hint && <p>{hint}</p>}</div><div className="setting-control">{children}</div></div>;
}
function SegmentedControl<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return <div className="setting-segments" role="radiogroup" aria-label={label}>{options.map((option, index) => <button type="button" role="radio" aria-checked={option.value === value} tabIndex={option.value === value ? 0 : -1} key={option.value} onClick={() => onChange(option.value)} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + step + options.length) % options.length;
    onChange(options[next].value);
    (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
  }}>{option.label}</button>)}</div>;
}
function shortcutLabel(code: string) {
  if (code === 'Space') return t('spaceKey');
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return arrows[code] ?? code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ');
}
function ShortcutControl({ action, value, onChange }: { action: string; value: string; onChange: (value: string) => void }) {
  const [capturing, setCapturing] = useState(false);
  const [invalid, setInvalid] = useState(false);
  return <div className="shortcut-capture"><button type="button" className={`shortcut-key ${capturing ? 'capturing' : ''}`} aria-label={t('changeShortcut', { action })} aria-pressed={capturing} onClick={() => { setCapturing(true); setInvalid(false); }} onBlur={() => { setCapturing(false); setInvalid(false); }} onKeyDown={event => {
    if (!capturing) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'Escape') { setCapturing(false); setInvalid(false); return; }
    if (event.repeat) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !isShortcutCode(event.code)) { setInvalid(true); return; }
    onChange(event.code); setCapturing(false); setInvalid(false);
  }}>{capturing ? t('pressShortcut') : shortcutLabel(value)}</button>{invalid && <span className="error-text" role="status">{t('invalidShortcut')}</span>}</div>;
}
function WaitRange({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const rangeId = useId();
  return <div className="wait-range" aria-describedby={rangeId}>
    <div className="wait-range-slider">
      <div className="wait-range-track"><span style={{ left: `${settings.waitMinSeconds / 6}%`, right: `${100 - settings.waitMaxSeconds / 6}%` }} /></div>
      <input type="range" aria-label={t('minimumWait')} aria-valuemax={settings.waitMaxSeconds} aria-valuetext={t('secondsValue', { value: settings.waitMinSeconds })} min="0" max="600" step="1" value={settings.waitMinSeconds} onChange={event => update({ waitMinSeconds: Math.min(Number(event.target.value), settings.waitMaxSeconds) })} />
      <input type="range" aria-label={t('maximumWait')} aria-valuemin={settings.waitMinSeconds} aria-valuetext={t('secondsValue', { value: settings.waitMaxSeconds })} min="0" max="600" step="1" value={settings.waitMaxSeconds} onChange={event => update({ waitMaxSeconds: Math.max(Number(event.target.value), settings.waitMinSeconds) })} />
    </div>
    <div className="wait-range-inputs">{(['waitMinSeconds', 'waitMaxSeconds'] as const).map((key, index) => <label key={key}>{t(index === 0 ? 'minimumWait' : 'maximumWait')}<div className="number-unit"><input type="number" aria-label={`${t(index === 0 ? 'minimumWait' : 'maximumWait')} (s)`} min={index === 0 ? 0 : settings.waitMinSeconds} max={index === 0 ? settings.waitMaxSeconds : 600} step="1" value={settings[key]} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 600) update(index === 0 ? { waitMinSeconds: Math.min(value, settings.waitMaxSeconds) } : { waitMaxSeconds: Math.max(value, settings.waitMinSeconds) }); }} /><span>s</span></div></label>)}</div>
    <p id={rangeId}>{t('waitRangeHint')}</p>
  </div>;
}

const tabs = ['simulation', 'audioSettings', 'appearance', 'shortcuts', 'privacy'] as const;
export function SettingsDialog({ settings, onUpdate, onClose }: { settings: Settings; onUpdate: (patch: Partial<Settings>) => Promise<unknown>; onClose: () => void }) {
  const [tab, setTab] = useState<typeof tabs[number]>('simulation');
  const tabId = useId();
  const [connection, setConnection] = useState<'online' | 'offline' | 'connectionUnknown'>(navigator.onLine ? 'connectionUnknown' : 'offline');
  const [checking, setChecking] = useState(false);
  const connectionRequest = useRef(0);
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>('unavailable');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(loadMetricsConsent);
  const telemetryStatus = telemetry.getStatus();
  const updateConsent = (next: typeof consent) => { try { saveMetricsConsent(next); setConsent(next); } catch { setError(t('saveError')); } };
  const update = (patch: Partial<Settings>) => { setError(''); void onUpdate(patch).catch(() => setError(t('saveError'))); };
  const reset = async () => {
    setError('');
    ambiencePlayer.pause();
    const audioSaved = saveAudioPreferences(DEFAULT_AUDIO_PREFERENCES);
    try { await onUpdate({ ...DEFAULT_SETTINGS, eventId: settings.eventId, language: settings.language }); }
    catch { setError(t('saveError')); }
    if (!audioSaved) setError(t('saveError'));
  };
  const check = async () => {
    const request = ++connectionRequest.current;
    if (!navigator.onLine) { setConnection('offline'); setChecking(false); return; }
    setChecking(true);
    try {
      const response = await fetch('/connection-check.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      const json = await response.json() as { service?: string };
      if (request === connectionRequest.current) setConnection(response.ok && json.service === 'cubing-comp-sim' ? 'online' : 'connectionUnknown');
    } catch { if (request === connectionRequest.current) setConnection(navigator.onLine ? 'connectionUnknown' : 'offline'); }
    finally { if (request === connectionRequest.current) setChecking(false); }
  };
  useEffect(() => { void check(); const online = () => void check(); const offline = () => { connectionRequest.current++; setConnection('offline'); setChecking(false); }; window.addEventListener('online', online); window.addEventListener('offline', offline); return () => { connectionRequest.current++; window.removeEventListener('online', online); window.removeEventListener('offline', offline); }; }, []);
  useEffect(() => registerOfflineSupport(setOfflineStatus), []);
  const connectionHeader = <div className="settings-connection"><div><span className={`status-dot ${connection}`} /><span role="status">{t(connection)}</span><button type="button" className="text-button" disabled={checking} onClick={() => void check()}>{t(checking ? 'checkingConnection' : 'checkConnection')}</button></div><p>{t('localAlways')} {offlineStatus === 'ready' ? t('offlineReady') : offlineStatus === 'downloading' ? t('offlinePreparing') : offlineStatus === 'update-ready' ? t('offlineUpdate') : ''}</p>{error && <p role="alert" className="error-text">{error}</p>}</div>;
  return <Dialog title={t('settings')} onClose={onClose} className="settings-dialog" headerContent={connectionHeader}>
    <div className="settings-tabs" role="tablist" aria-label={t('settings')}>{tabs.map((key, index) => <button type="button" key={key} id={`${tabId}-${key}`} role="tab" aria-selected={tab === key} aria-controls={`${tabId}-panel`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length;
      setTab(tabs[next]); (event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
    }}>{t(key)}</button>)}</div>
    <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`}>
    {tab === 'simulation' && <>
      <Row label={t('wait')}><Toggle label={t('wait')} checked={settings.waitEnabled} onChange={value => update({ waitEnabled: value, ...(value && settings.waitMode === 'fixed' && settings.waitSeconds === 0 ? { waitSeconds: 30 } : {}) })} /></Row>
      {settings.waitEnabled && <><Row label={t('waitDuration')}><SegmentedControl label={t('waitDuration')} value={settings.waitMode} options={[{ value: 'fixed', label: t('fixedDuration') }, { value: 'random', label: t('randomDuration') }]} onChange={waitMode => update({ waitMode })} /></Row>
      {settings.waitMode === 'fixed' ? <Row label={t('fixedDuration')}><div className="number-unit"><input aria-label={t('waitDuration')} type="number" min="0" max="600" step="1" value={settings.waitSeconds} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 600) update({ waitSeconds: value }); }} /><span>s</span></div></Row> : <Row label={t('waitRange')}><WaitRange settings={settings} update={update} /></Row>}</>}
      <Row label={t('inspection')}><Toggle label={t('inspection')} checked={settings.inspection} onChange={value => update({ inspection: value })} /></Row>
      <Row label={t('input')}><Select label={t('input')} value={settings.inputMethod} options={[{ value: 'timer', label: t('keyboard') }, { value: 'manual', label: t('manual') }]} onChange={inputMethod => update({ inputMethod: inputMethod as Settings['inputMethod'] })} /></Row>
      <Row label={t('holdDuration')}><div className="number-unit"><input aria-label={t('holdDuration')} type="number" min="0" max="5" step="0.05" value={settings.holdMs / 1000} onChange={event => { const value = Math.round(Number(event.target.value) * 1000); if (value >= 0 && value <= 5000) update({ holdMs: value }); }} /><span>s</span></div></Row>
      <Row label={t('goal')}><div className="number-unit"><input aria-label={t('goal')} placeholder={t('noGoal')} type="number" min="0" step="0.01" value={settings.goalMs === null ? '' : settings.goalMs / 1000} onChange={event => { const value = event.target.value === '' ? null : Math.round(Number(event.target.value) * 1000); if (value === null || value >= 0) update({ goalMs: value }); }} /><span>s</span></div></Row>
    </>}
    {tab === 'audioSettings' && <div className="audio-settings"><AudioSettings locale={settings.language} /></div>}
    {tab === 'appearance' && <>
      <Row label={t('theme')}><SegmentedControl label={t('theme')} value={settings.theme} options={[{ value: 'dark', label: t('dark') }, { value: 'light', label: t('light') }, { value: 'system', label: t('systemTheme') }]} onChange={theme => update({ theme })} /></Row>
      <Row label={t('language')}><Select label={t('language')} value={settings.language} options={LOCALES.map(locale => ({ value: locale.id, label: locale.nativeName }))} onChange={language => update({ language: language as Settings['language'] })} /></Row>
      <Row label={t('textFont')}><Select label={t('textFont')} value={settings.textFont} options={FONT_OPTIONS} onChange={textFont => update({ textFont: textFont as Settings['textFont'] })} /></Row>
      <Row label={t('numberFont')}><Select label={t('numberFont')} value={settings.numberFont} options={FONT_OPTIONS} onChange={numberFont => update({ numberFont: numberFont as Settings['numberFont'] })} /></Row>
      <div className="font-preview"><p>{t('fontPreview')}</p><div>0:12.34 · 56789</div></div><p className="settings-hint">{t('fontFallbackHint')}</p>
    </>}
    {tab === 'shortcuts' && <div className="shortcut-settings"><p className="settings-hint">{t('fixedShortcutsHint')}</p><Row label={`${t('advance')} · ${t('additionalShortcut')}`} hint={t('outsideFields')}><ShortcutControl action={t('advance')} value={settings.shortcuts.advance} onChange={advance => update({ shortcuts: { ...settings.shortcuts, advance } })} /></Row><Row label={t('startTimer')} hint={t('holdInstruction')}><kbd>{t('spaceKey')}</kbd></Row><Row label={t('stopTimer')}><kbd>{t('anyKey')}</kbd></Row><Row label={`${t('submitSolve')} · ${t('additionalShortcut')}`}><ShortcutControl action={t('submitSolve')} value={settings.shortcuts.submit} onChange={submit => update({ shortcuts: { ...settings.shortcuts, submit } })} /></Row><p className="settings-hint">{t('shortcutHint')}</p></div>}
    {tab === 'privacy' && <><p className="settings-hint">{t('privacyHint')}</p><Row label={t('usageMetrics')} hint={telemetryStatus.productConfigured ? t('usageMetricsHint') : t('previewUnavailable')}><Toggle label={t('usageMetrics')} checked={consent.product} disabled={!telemetryStatus.productConfigured} onChange={product => updateConsent({ ...consent, product })} /></Row><Row label={t('errorReports')} hint={telemetryStatus.diagnosticsConfigured ? t('errorReportsHint') : t('previewUnavailable')}><Toggle label={t('errorReports')} checked={consent.diagnostics} disabled={!telemetryStatus.diagnosticsConfigured} onChange={diagnostics => updateConsent({ ...consent, diagnostics })} /></Row></>}
    </div>
    <button type="button" className="secondary-button settings-reset" onClick={() => void reset()}>{t('resetSettings')}</button>
  </Dialog>;
}
