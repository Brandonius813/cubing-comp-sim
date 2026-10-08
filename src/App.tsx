import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { EVENTS, attemptTimeMs, editAttempt, formatAttempt, formatTime, getEvent, parseTimeInput, scoreRound, type Attempt, type EventId, type Penalty, type Round } from './core';
import { auth, type AccountSession } from './cloud';
import { MAX_IMPORT_BYTES } from './storage';
import { registerOfflineSupport } from './platform/offline';
import { AccountDialog } from './ui/AccountDialog';
import { SettingsDialog } from './ui/SettingsDialog';
import { Dialog, FlowButton, Icon, IconButton } from './ui/primitives';
import { Scorecard, eventName, formatLabel, scoreText } from './ui/Scorecard';
import { useSimulator } from './ui/useSimulator';
import { errorMessage, localizedDate, setLocale, t, useLocale } from './ui/i18n';
import { telemetry } from './telemetry';
import { loadMetricsConsent } from './ui/metricsConsent';
import './styles/app.css';

type Modal = 'settings' | 'account' | 'help' | 'stats' | 'events' | 'edit' | 'import' | null;
function App() {
  const [modal, setModal] = useState<Modal>(null);
  const sim = useSimulator(modal !== null);
  useLocale();
  useEffect(() => { setLocale(sim.state.settings.language); }, [sim.state.settings.language]);
  const [session, setSession] = useState<AccountSession | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [timeInput, setTimeInput] = useState('');
  const [penalty, setPenalty] = useState<Penalty>('none');
  const [fieldError, setFieldError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [historyEvent, setHistoryEvent] = useState<EventId | 'all'>('all');
  const [historyPage, setHistoryPage] = useState(0);
  const [importContent, setImportContent] = useState('');
  const [importRevision, setImportRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const round = useMemo(() => sim.state.rounds.find(value => value.id === sim.state.activeRoundId) ?? null, [sim.state.rounds, sim.state.activeRoundId]);
  const selectedEvent = getEvent(round && !['home', 'engine-error'].includes(sim.phase) ? round.eventId : sim.state.settings.eventId);
  const scorecardRound = round?.eventId === selectedEvent.id ? round : null;
  const roundNumber = useMemo(() => Math.max(1, sim.state.rounds.filter(value => value.eventId === selectedEvent.id).length), [sim.state.rounds, selectedEvent.id]);
  const homeLike = ['home', 'complete', 'engine-error', 'loading'].includes(sim.phase);
  const cardVisible = homeLike && sim.state.settings.showScorecard;
  const timerActive = ['inspection', 'solving'].includes(sim.phase);
  const editingRound = useMemo(() => editingId ? sim.state.rounds.find(value => value.attempts.some(attempt => attempt.id === editingId)) : null, [editingId, sim.state.rounds]);
  const editingAttempt = editingRound?.attempts.find(value => value.id === editingId);
  useEffect(() => { void auth.getSession().then(setSession).catch(() => undefined); return auth.subscribe((value, event) => { setSession(value); if (event === 'PASSWORD_RECOVERY') { setRecovery(true); setModal('account'); } }); }, []);
  useEffect(() => { telemetry.setConsent(loadMetricsConsent()); return registerOfflineSupport(status => { if (status === 'ready') telemetry.track('offline_assets_ready'); }); }, []);
  useEffect(() => { if (sim.phase === 'entry') { setTimeInput(''); setPenalty('none'); setFieldError(''); } }, [sim.phase]);
  const close = () => { setModal(null); setFieldError(''); };
  const edit = (attemptId: string) => {
    const attempt = sim.state.rounds.flatMap(value => value.attempts).find(value => value.id === attemptId);
    if (!attempt) return;
    setEditingId(attemptId); setTimeInput(attempt.rawMs === null ? '' : formatTime(attempt.rawMs, { precision: 'milliseconds' })); setPenalty(attempt.penalty); setFieldError(''); setModal('edit');
  };
  const applySettings = async (patch: Parameters<typeof sim.updateSettings>[0]) => { await sim.updateSettings(patch); };
  const chooseEvent = async (eventId: EventId) => {
    try {
      await sim.updateSettings({ eventId });
      const prior = sim.state.rounds.find(value => value.eventId === eventId && !value.completedAt);
      await sim.mutate(s => sim.store.setActiveRound(prior?.id ?? null, s.revision));
      sim.home(); close();
    } catch { /* Simulator displays the storage failure. */ }
  };
  const submitManual = (event: FormEvent) => {
    event.preventDefault(); if (sim.saving) return;
    const parsed = parseTimeInput(timeInput.replace(',', '.') || (penalty === 'DNF' || penalty === 'DNS' ? penalty : ''));
    if (!parsed) { setFieldError(t('invalid')); return; }
    setFieldError('');
    void sim.record(parsed.rawMs, penalty === 'none' ? parsed.penalty : penalty, 'manual').then(async saved => { if (saved) await sim.advance(); });
  };
  const saveEdit = (event: FormEvent) => {
    event.preventDefault(); if (!editingRound || !editingAttempt) return;
    const parsed = parseTimeInput(timeInput.replace(',', '.') || (penalty === 'DNF' || penalty === 'DNS' ? penalty : ''));
    if (!parsed) { setFieldError(t('invalid')); return; }
    const updated = editAttempt(editingRound, editingAttempt.id, { rawMs: parsed.rawMs, penalty: penalty === 'none' ? parsed.penalty : penalty });
    void sim.mutate(s => sim.store.updateRound(updated, s.revision)).then(close).catch(() => undefined);
  };
  const downloadExport = async () => {
    try { const json = await sim.store.exportJson(); const url = URL.createObjectURL(new Blob([json], { type: 'application/json' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `cubing-comp-sim-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch { sim.setError(t('loadError')); }
  };
  const replaceHistory = async (json: string, revision: number) => {
    await sim.mutate(() => sim.store.replaceFromJson(json, revision)); sim.home();
  };
  const displayAttempt = sim.lastAttempt && round?.attempts.find(value => value.id === sim.lastAttempt?.id) || sim.lastAttempt;
  const filteredRounds = useMemo(() => modal === 'stats' ? sim.state.rounds.filter(value => historyEvent === 'all' || value.eventId === historyEvent) : [], [modal, sim.state.rounds, historyEvent]);
  const visibleRounds = filteredRounds.slice(historyPage * 50, (historyPage + 1) * 50);
  const solves = useMemo(() => filteredRounds.flatMap(value => value.attempts), [filteredRounds]);
  const validTimes = useMemo(() => solves.map(attemptTimeMs).filter((value): value is number => value !== null), [solves]);
  const bestSingle = useMemo(() => validTimes.reduce((best, value) => Math.min(best, value), Infinity), [validTimes]);
  const roundTimes = round?.attempts.map(attemptTimeMs).filter((value): value is number => value !== null) ?? [];
  return <div className="app" data-phase={sim.phase}>
    <header className="app-header">
      <div className="logo-space" aria-label={t('app')} />
      <button type="button" className="event-selector" aria-haspopup="dialog" disabled={timerActive || sim.phase === 'loading'} onClick={() => setModal('events')}><Icon name={selectedEvent.id} event /><span>{eventName(selectedEvent.id)}</span><Icon name="chevron" /></button>
      <nav className="utilities" aria-label={t('utilities')}><IconButton name="account" label={t('account')} disabled={timerActive} onClick={() => setModal('account')} /><IconButton name="help" label={t('help')} disabled={timerActive} onClick={() => setModal('help')} /><IconButton name="settings" label={t('settings')} disabled={timerActive} onClick={() => setModal('settings')} /></nav>
    </header>
    <main className={`workspace ${cardVisible ? 'with-scorecard' : ''}`}>
      <div className="main-stage">
        {sim.phase === 'home' && <FlowButton onClick={sim.primary} disabled={!sim.loaded || sim.saving} shortcut={`Enter / ${t('spaceKey')}`}>{round && round.completedAt === undefined && round.attempts.length > 0 && round.eventId === selectedEvent.id ? t('resume') : t('start')}</FlowButton>}
        {sim.phase === 'loading' && <div className="center-message" role="status"><span className="loading-spinner" /><p>{t('generating')}</p></div>}
        {sim.phase === 'engine-error' && <div className="center-message"><p className="error-text">{sim.error}</p><FlowButton onClick={sim.primary}>{t('retry')}</FlowButton><button className="text-button" onClick={sim.home}>{t('home')}</button></div>}
        {sim.phase === 'scramble' && sim.scramble && <section className="scramble-stage"><div className="scramble-heading"><p className="solve-counter">{t('solveCounter', { current: (round?.attempts.length ?? 0) + 1, total: selectedEvent.attemptCount })}</p><p className="scramble-notation">{sim.scramble.notation}</p></div><div className="drawing-area"><img className="scramble-drawing" alt={t('drawingAlt', { event: eventName(selectedEvent.id) })} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(sim.scramble.svg)}`} /></div><FlowButton onClick={sim.primary} disabled={sim.saving} shortcut={`Enter / ${t('spaceKey')}`}>{t('scrambleGood')}</FlowButton></section>}
        {sim.phase === 'waiting' && <><div className="timer-block"><p className="waiting-label">{t('waiting')}</p><div className="timer-number waiting-number">{Math.floor(Math.ceil(sim.elapsed / 1000) / 60)}:{String(Math.ceil(sim.elapsed / 1000) % 60).padStart(2, '0')}</div></div><div className="bottom-action"><FlowButton secondary onClick={sim.primary} disabled={sim.saving}>{t('ready')}</FlowButton></div></>}
        {sim.phase === 'ready' && (sim.state.settings.inputMethod === 'manual' || sim.state.settings.inspection && selectedEvent.inspection ? <FlowButton onClick={sim.primary} disabled={sim.saving} shortcut={`Enter / ${t('spaceKey')}`}>{t('ready')}</FlowButton> : <div className="timer-block"><p>{sim.armed ? t('release') : t('hold')}</p><div className={`timer-number ${sim.armed ? 'positive-text' : sim.holding ? 'warning-text' : ''}`}>0.00</div></div>)}
        {sim.phase === 'inspection' && <><div className="timer-block"><p>{sim.armed ? t('release') : t('inspection')}</p><div className={`timer-number ${sim.armed ? 'positive-text' : sim.elapsed >= 17000 ? 'error-text' : sim.elapsed >= 15000 ? 'warning-text' : ''}`}>{formatTime(sim.elapsed)}</div>{sim.elapsed >= 15000 && <span className="inspection-penalty">{sim.elapsed >= 17000 ? 'DNF' : '+2'}</span>}</div><div className="bottom-action">{sim.state.settings.inputMethod === 'manual' ? <FlowButton secondary onClick={sim.primary} disabled={sim.saving}>{t('startSolve')}</FlowButton> : <p className="key-hint">{sim.armed ? t('release') : t('hold')}</p>}</div></>}
        {sim.phase === 'solving' && <div className="timer-block"><div className="timer-number">{formatTime(sim.elapsed)}</div><span className="sr-only">{t('stop')}</span></div>}
        {sim.phase === 'entry' && <form className="time-entry" onSubmit={submitManual}><label htmlFor="manual-time">{t('time')}</label><input id="manual-time" className="time-input" autoFocus autoComplete="off" inputMode="decimal" value={timeInput} onChange={event => setTimeInput(event.target.value)} aria-invalid={Boolean(fieldError)} aria-describedby={fieldError ? 'manual-error' : undefined} />{fieldError && <p id="manual-error" className="error-text" role="alert">{fieldError}</p>}<PenaltyButtons penalty={penalty} onChange={setPenalty} />{sim.automaticPenalty !== 'none' && <p className="muted">{t('inspectionAutomatic', { penalty: sim.automaticPenalty })}</p>}<button className="flow-button" type="submit" disabled={sim.saving}>{sim.saving ? t('saving') : t('submit')}</button></form>}
        {sim.phase === 'confirm' && <div className="confirm-stage"><div className="timer-number">{displayAttempt ? formatAttempt(displayAttempt) : formatTime(sim.elapsed)}</div><div className="confirm-actions">{displayAttempt && <button className="text-button" onClick={() => edit(displayAttempt.id)} disabled={sim.saving || !round?.attempts.some(value => value.id === displayAttempt.id)}>{t('editTime')}</button>}<FlowButton onClick={() => void sim.advance()} disabled={sim.saving} shortcut="Enter">{sim.saving ? t('saving') : t('confirmSolve')}</FlowButton></div></div>}
        {sim.phase === 'complete' && round && <div className="complete-stage"><p>{formatLabel(round.format)}</p><div className="timer-number">{scoreText(scoreRound(round))}</div><p className="round-extremes">{t('fastest')}　{roundTimes.length ? formatTime(Math.min(...roundTimes)) : 'DNF'}　 {t('slowest')}　{roundTimes.length ? formatTime(Math.max(...roundTimes)) : 'DNF'}</p><FlowButton onClick={sim.primary} disabled={sim.saving} shortcut={`Enter / ${t('spaceKey')}`}>{t('start')}</FlowButton></div>}
      </div>
      {cardVisible && <Scorecard round={scorecardRound} eventId={selectedEvent.id} roundNumber={roundNumber} onHide={() => void applySettings({ showScorecard: false }).catch(() => undefined)} onEdit={edit} onStats={() => setModal('stats')} />}
    </main>
    {homeLike && !cardVisible && <button type="button" className="show-scorecard secondary-button" onClick={() => void applySettings({ showScorecard: true }).catch(() => undefined)}>{t('showScorecard')}</button>}
    {['entry', 'confirm'].includes(sim.phase) && <button className="open-scorecard secondary-button" onClick={() => setModal('stats')}>{t('scorecard')}　{round?.attempts.length ?? 0} / {selectedEvent.attemptCount}</button>}
    {sim.error && sim.phase !== 'engine-error' && <div className="app-message error-text" role="alert">{sim.error}</div>}
    {sim.notice && !sim.error && <div className="app-message" role="status">{sim.notice}</div>}
    {sim.saving && sim.phase !== 'solving' && <span className="save-status" role="status">{t('saving')}</span>}
    {modal === 'events' && <Dialog title={t('chooseEvent')} onClose={close} className="event-picker"><div className="event-list">{[...EVENTS].sort((a, b) => a.id === '333' ? -1 : b.id === '333' ? 1 : 0).map(value => <button type="button" className={selectedEvent.id === value.id ? 'selected' : ''} key={value.id} onClick={() => void chooseEvent(value.id)}><Icon name={value.id} event /><span>{eventName(value.id)}</span></button>)}</div></Dialog>}
    {modal === 'settings' && <SettingsDialog settings={sim.state.settings} onUpdate={applySettings} onClose={close} />}
    {modal === 'account' && <AccountDialog session={session} recovery={recovery} onClose={close} onExport={() => sim.store.exportJson()} onReplace={replaceHistory} localRevision={sim.state.revision} />}
    {modal === 'help' && <Dialog title={t('help')} onClose={close}><div className="help-content"><h2>{t('helpIntro')}</h2><ol><li>{t('helpScramble')}</li><li>{t('helpTimer')}</li><li>{t('helpManual')}</li></ol><p>{t('helpStorage')}</p><p>{t('helpCloud')}</p><a href="https://github.com/Brandonius813/cubing-comp-sim" target="_blank" rel="noreferrer">{t('sourceLicenses')}</a></div></Dialog>}
    {modal === 'edit' && editingAttempt && <Dialog title={`${t('editTime')} · ${editingAttempt.index + 1}`} onClose={close} className="edit-dialog"><form onSubmit={saveEdit} className="edit-form"><label>{t('time')}<input autoFocus className="time-input" autoComplete="off" value={timeInput} onChange={event => setTimeInput(event.target.value)} /></label><PenaltyButtons penalty={penalty} onChange={setPenalty} />{editingAttempt.inspectionPenalty !== 'none' && <p className="muted">{t('inspectionEdit', { penalty: editingAttempt.inspectionPenalty })}</p>}{fieldError && <p className="error-text" role="alert">{fieldError}</p>}<button className="primary-button" disabled={sim.saving} type="submit">{t('save')}</button><p className="muted scramble-detail">{editingAttempt.scramble.notation}</p></form></Dialog>}
    {modal === 'stats' && <Dialog title={t('history')} onClose={close}><div className="history-toolbar"><select aria-label={t('event')} value={historyEvent} onChange={event => { setHistoryEvent(event.target.value as EventId | 'all'); setHistoryPage(0); }}><option value="all">{t('allEvents')}</option>{EVENTS.map(value => <option key={value.id} value={value.id}>{eventName(value.id)}</option>)}</select><div className="button-row"><button className="secondary-button" onClick={() => void downloadExport()}>{t('export')}</button><button className="secondary-button" onClick={() => fileInput.current?.click()}>{t('import')}</button></div></div><div className="history-metrics"><div><span>{t('solves')}</span><strong>{solves.length}</strong></div><div><span>{t('completedRounds')}</span><strong>{filteredRounds.filter(value => value.completedAt).length}</strong></div><div><span>{t('bestSingle')}</span><strong>{validTimes.length ? formatTime(bestSingle) : '—'}</strong></div></div>{filteredRounds.length === 0 ? <p className="empty-history">{t('noHistory')}</p> : <div className="history-rounds">{visibleRounds.map(value => <HistoryRound key={value.id} round={value} onEdit={edit} />)}</div>}{filteredRounds.length > 50 && <div className="button-row history-pagination"><button className="secondary-button" disabled={historyPage === 0} onClick={() => setHistoryPage(page => page - 1)}>{t('previous')}</button><span>{historyPage + 1} / {Math.ceil(filteredRounds.length / 50)}</span><button className="secondary-button" disabled={(historyPage + 1) * 50 >= filteredRounds.length} onClick={() => setHistoryPage(page => page + 1)}>{t('nextPage')}</button></div>}</Dialog>}
    {modal === 'import' && <Dialog title={t('importTitle')} onClose={close} className="account-dialog"><p>{t('importDescription')}</p>{fieldError && <p role="alert" className="error-text">{fieldError}</p>}<div className="button-row"><button className="primary-button" disabled={sim.saving} onClick={() => void replaceHistory(importContent, importRevision).then(close).catch(cause => setFieldError(errorMessage(cause, 'saveError')))}>{t('replace')}</button><button className="secondary-button" onClick={close}>{t('cancel')}</button></div></Dialog>}
    <input ref={fileInput} className="sr-only" type="file" accept="application/json,.json" aria-label={t('importFile')} onChange={event => { const file = event.target.files?.[0]; if (!file) return; if (file.size > MAX_IMPORT_BYTES) { sim.setError(t('fileTooLarge')); return; } void file.text().then(text => { setImportContent(text); setImportRevision(sim.state.revision); setModal('import'); }).catch(() => sim.setError(t('fileReadError'))); event.target.value = ''; }} />
  </div>;
}

function PenaltyButtons({ penalty, onChange }: { penalty: Penalty; onChange: (value: Penalty) => void }) {
  return <div className="penalty-buttons">{(['+2', 'DNF'] as const).map(value => <button type="button" className={penalty === value ? 'selected' : ''} key={value} aria-pressed={penalty === value} onClick={() => onChange(penalty === value ? 'none' : value)}>{value}</button>)}</div>;
}
function HistoryRound({ round, onEdit }: { round: Round; onEdit: (id: Attempt['id']) => void }) {
  return <section className="history-round"><div className="history-round-title"><h2>{eventName(round.eventId)}</h2><span>{localizedDate(round.createdAt)}</span><strong>{formatLabel(round.format)}　{scoreText(scoreRound(round))}</strong></div><div className="history-attempts">{round.attempts.map(attempt => <button className="secondary-button" key={attempt.id} onClick={() => onEdit(attempt.id)}><span>{attempt.index + 1}</span>{formatAttempt(attempt)}</button>)}</div></section>;
}
export default App;
