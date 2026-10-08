import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type Settings } from '../storage';
import { registerOfflineSupport, type OfflineStatus } from '../platform/offline';
import { Dialog, Toggle } from './primitives';
import { t } from './i18n';
import { telemetry } from '../telemetry';
import { loadMetricsConsent, saveMetricsConsent } from './metricsConsent';

function Row({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <div className="setting-row"><div><label>{label}</label>{hint && <p>{hint}</p>}</div><div className="setting-control">{children}</div></div>;
}
export function SettingsDialog({ settings, onUpdate, onClose }: { settings: Settings; onUpdate: (patch: Partial<Settings>) => Promise<unknown>; onClose: () => void }) {
  const [tab, setTab] = useState<'simulation' | 'appearance' | 'shortcuts'>('simulation');
  const [connection, setConnection] = useState<'online' | 'offline' | 'connectionUnknown'>(navigator.onLine ? 'connectionUnknown' : 'offline');
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>('unavailable');
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(loadMetricsConsent);
  const telemetryStatus = telemetry.getStatus();
  const updateConsent = (next: typeof consent) => { try { saveMetricsConsent(next); setConsent(next); } catch { setError(t('saveError')); } };
  const update = (patch: Partial<Settings>) => { setError(''); void onUpdate(patch).catch(() => setError(t('saveError'))); };
  const check = async () => {
    if (!navigator.onLine) { setConnection('offline'); return; }
    try {
      const response = await fetch('/connection-check.json', { cache: 'no-store', signal: AbortSignal.timeout(5000) });
      const json = await response.json() as { service?: string };
      setConnection(response.ok && json.service === 'cubing-comp-sim' ? 'online' : 'connectionUnknown');
    } catch { setConnection(navigator.onLine ? 'connectionUnknown' : 'offline'); }
  };
  useEffect(() => { void check(); const online = () => void check(); const offline = () => setConnection('offline'); window.addEventListener('online', online); window.addEventListener('offline', offline); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); }; }, []);
  useEffect(() => registerOfflineSupport(setOfflineStatus), []);
  return <Dialog title={t('settings')} onClose={onClose}>
    <div className="settings-tabs" role="tablist" aria-label={t('settings')}>{(['simulation', 'appearance', 'shortcuts'] as const).map(key => <button type="button" key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{t(key)}</button>)}</div>
    {error && <p role="alert" className="error-text">{error}</p>}
    {tab === 'simulation' && <div role="tabpanel">
      <Row label={t('wait')}><Toggle label={t('wait')} checked={settings.waitSeconds > 0} onChange={value => update({ waitSeconds: value ? 30 : 0 })} /></Row>
      <Row label={t('waitDuration')}><div className="number-unit"><input aria-label={t('waitDuration')} type="number" min="0" max="600" step="1" value={settings.waitSeconds} onChange={event => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 0 && value <= 600) update({ waitSeconds: value }); }} /><span>s</span></div></Row>
      <Row label={t('inspection')}><Toggle label={t('inspection')} checked={settings.inspection} onChange={value => update({ inspection: value })} /></Row>
      <Row label={t('input')}><select aria-label={t('input')} value={settings.inputMethod} onChange={event => update({ inputMethod: event.target.value as Settings['inputMethod'] })}><option value="timer">{t('keyboard')}</option><option value="manual">{t('manual')}</option></select></Row>
      <Row label={t('holdDuration')}><div className="number-unit"><input aria-label={t('holdDuration')} type="number" min="0" max="5" step="0.05" value={settings.holdMs / 1000} onChange={event => { const value = Math.round(Number(event.target.value) * 1000); if (value >= 0 && value <= 5000) update({ holdMs: value }); }} /><span>s</span></div></Row>
      <Row label={t('alerts')} hint={t('alertsDescription')}><Toggle label={t('alerts')} checked={settings.audioCallouts} onChange={value => update({ audioCallouts: value })} /></Row>
      <Row label={t('goal')}><div className="number-unit"><input aria-label={t('goal')} placeholder={t('noGoal')} type="number" min="0" step="0.01" value={settings.goalMs === null ? '' : settings.goalMs / 1000} onChange={event => { const value = event.target.value === '' ? null : Math.round(Number(event.target.value) * 1000); if (value === null || value >= 0) update({ goalMs: value }); }} /><span>s</span></div></Row>
    </div>}
    {tab === 'appearance' && <div role="tabpanel"><Row label={t('showScorecard')}><Toggle label={t('showScorecard')} checked={settings.showScorecard} onChange={value => update({ showScorecard: value })} /></Row><Row label={t('theme')}><span>{t('dark')}</span></Row><Row label={t('language')}><select aria-label={t('language')} value="en" onChange={() => undefined}><option value="en">English</option></select></Row></div>}
    {tab === 'shortcuts' && <div role="tabpanel" className="shortcut-settings"><Row label={t('advance')} hint={t('outsideFields')}><kbd>Enter</kbd><kbd>Space</kbd></Row><Row label={t('startTimer')} hint="Hold to arm, release to start"><kbd>Space</kbd></Row><Row label={t('stopTimer')}><kbd>{t('anyKey')}</kbd></Row><Row label={t('submitSolve')}><kbd>Enter</kbd></Row></div>}
    <div className="connection-setting"><span className={`status-dot ${connection}`} /><span>{t(connection)}</span><button type="button" className="text-button" onClick={() => void check()}>{t('checkConnection')}</button><p>{t('localAlways')} {offlineStatus === 'ready' ? 'This website is ready to reopen offline.' : offlineStatus === 'downloading' ? 'Preparing offline files…' : offlineStatus === 'update-ready' ? 'An update is ready for your next visit.' : ''}</p></div>
    <Row label="Usage metrics" hint={telemetryStatus.productConfigured ? 'Optional counts of app use. No times or scrambles are collected.' : 'Unavailable in this preview.'}><Toggle label="Usage metrics" checked={consent.product} disabled={!telemetryStatus.productConfigured} onChange={product => updateConsent({ ...consent, product })} /></Row>
    <Row label="Error reports" hint={telemetryStatus.diagnosticsConfigured ? 'Optional technical error reports. No times or scrambles are included.' : 'Unavailable in this preview.'}><Toggle label="Error reports" checked={consent.diagnostics} disabled={!telemetryStatus.diagnosticsConfigured} onChange={diagnostics => updateConsent({ ...consent, diagnostics })} /></Row>
    <button className="secondary-button" onClick={() => update({ ...DEFAULT_SETTINGS, eventId: settings.eventId })}>{t('resetSettings')}</button>
  </Dialog>;
}
