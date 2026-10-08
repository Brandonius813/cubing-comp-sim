import { useCallback, useEffect, useRef, useState } from 'react';
import { addAttempt, createAttempt, createRound, getEvent, inspectionPenalty, type Attempt, type Penalty, type Round, type Scramble } from '../core';
import { BrowserStore, DEFAULT_SETTINGS, StorageConflictError, type LocalState, type Settings } from '../storage';
import { createScrambleService } from '../scramble';
import { t } from './i18n';
import { telemetry } from '../telemetry';

export type Phase = 'home' | 'loading' | 'scramble' | 'waiting' | 'ready' | 'inspection' | 'solving' | 'entry' | 'confirm' | 'complete' | 'engine-error';
const initial: LocalState = { revision: 0, rounds: [], activeRoundId: null, settings: { ...DEFAULT_SETTINGS }, draft: null };
export const browserStore = new BrowserStore();

export function useSimulator(blockKeyboard: boolean) {
  const [state, setState] = useState<LocalState>(initial);
  const current = useRef(state);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhaseState] = useState<Phase>('home');
  const phaseRef = useRef(phase);
  const setPhase = useCallback((next: Phase) => { phaseRef.current = next; setPhaseState(next); }, []);
  const [scramble, setScramble] = useState<Scramble | null>(null);
  const scrambleRef = useRef(scramble); scrambleRef.current = scramble;
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [armed, setArmed] = useState(false);
  const [holding, setHolding] = useState(false);
  const [lastAttempt, setLastAttempt] = useState<Attempt | null>(null);
  const [automaticPenalty, setAutomaticPenalty] = useState<Penalty>('none');
  const lastAttemptRef = useRef<Attempt | null>(null);
  const engine = useRef<ReturnType<typeof createScrambleService> | null>(null);
  const serial = useRef(Promise.resolve());
  const ownMutation = useRef(false);
  const started = useRef(0);
  const inspectionMs = useRef<number | undefined>(undefined);
  const holdStart = useRef<number | null>(null);
  const heldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const callouts = useRef(new Set<number>());
  const generation = useRef(0);
  const recordBusy = useRef(false);
  const getRound = () => current.current.rounds.find(round => round.id === current.current.activeRoundId) ?? null;
  const apply = useCallback((next: LocalState) => { current.current = next; setState(next); }, []);
  const mutate = useCallback((operation: (state: LocalState) => Promise<LocalState>): Promise<LocalState> => {
    const task = serial.current.then(async () => {
      ownMutation.current = true;
      setSaving(true);
      try { const next = await operation(current.current); apply(next); setError(null); return next; }
      catch (cause) { setError(cause instanceof StorageConflictError ? t('storageConflict') : t('saveError')); telemetry.reportError('local_save_failed', { code: cause instanceof StorageConflictError ? 'REVISION_CONFLICT' : 'TRANSACTION_FAILED' }); throw cause; }
      finally { ownMutation.current = false; setSaving(false); }
    });
    serial.current = task.then(() => undefined, () => undefined);
    return task;
  }, [apply]);

  useEffect(() => {
    let mounted = true;
    browserStore.load().then(next => {
      if (!mounted) return;
      apply(next); setLoaded(true);
      if (next.draft) { setScramble(next.draft.scramble); setNotice(t('recovered')); setPhase('scramble'); }
    }).catch(() => { if (mounted) setError(t('loadError')); });
    return () => { mounted = false; };
  }, [apply, setPhase]);
  // A tab never silently replaces edits another tab may still be making.
  useEffect(() => browserStore.subscribe(() => {
    if (ownMutation.current) return;
    void browserStore.load().then(next => {
      if (next.revision > current.current.revision && !saving) setNotice(t('otherTab'));
    }).catch(() => undefined);
  }), [saving]);

  const cancelHold = useCallback(() => {
    if (heldTimer.current) clearTimeout(heldTimer.current);
    heldTimer.current = null; holdStart.current = null; setArmed(false); setHolding(false);
  }, []);
  useEffect(() => { if (blockKeyboard) cancelHold(); }, [blockKeyboard, cancelHold]);
  useEffect(() => () => { engine.current?.dispose(); cancelHold(); void audio.current?.close(); }, [cancelHold]);

  const prepareAudio = () => {
    if (!current.current.settings.audioCallouts) return;
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* Timing stays available without audio. */ }
  };
  const beep = () => {
    try { const ctx = audio.current; if (!ctx) return; const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); oscillator.frequency.value = 880; gain.gain.setValueAtTime(0.08, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16); oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + 0.17); } catch { /* Visual inspection remains active. */ }
  };
  const saveDraft = (stage: 'scramble' | 'waiting' | 'ready' | 'inspection' | 'solving') => {
    const round = getRound(); const value = scrambleRef.current;
    if (round && value) void mutate(s => browserStore.saveDraft({ roundId: round.id, scramble: value, stage, savedAt: Date.now() }, s.revision)).catch(() => undefined);
  };
  const generate = async (round: Round) => {
    const request = ++generation.current; setPhase('loading'); setError(null); setNotice(null);
    setAutomaticPenalty('none');
    try {
      engine.current ??= createScrambleService();
      const generated = await engine.current.generate(round.eventId);
      if (request !== generation.current) return;
      const value: Scramble = { ...generated, eventId: round.eventId };
      await mutate(s => browserStore.saveDraft({ roundId: round.id, scramble: value, stage: 'scramble', savedAt: Date.now() }, s.revision));
      setScramble(value); scrambleRef.current = value; setPhase('scramble');
    } catch (cause) {
      if (request !== generation.current) return;
      setError(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENGINE_UNAVAILABLE' ? t('engineError') : cause instanceof StorageConflictError ? t('storageConflict') : t('generationError'));
      telemetry.reportError('scramble_failed', { eventId: round.eventId, code: 'GENERATION_FAILED' });
      setPhase('engine-error');
    }
  };
  const start = async () => {
    if (!loaded || saving || phaseRef.current === 'loading') return;
    setPhase('loading');
    let round = getRound();
    if (!round || round.completedAt !== undefined || round.eventId !== current.current.settings.eventId) {
      round = createRound(current.current.settings.eventId, { goalMs: current.current.settings.goalMs ?? undefined });
      try { await mutate(s => browserStore.saveRound(round!, s.revision)); telemetry.track('round_started', { eventId: round.eventId, inputMode: current.current.settings.inputMethod, roundToken: round.id }); } catch { setPhase('home'); return; }
    }
    await generate(round);
  };
  const beginInspection = () => {
    prepareAudio(); cancelHold(); callouts.current.clear(); started.current = performance.now(); setElapsed(0); setPhase('inspection'); saveDraft('inspection');
  };
  const beginSolve = () => {
    const prior = phaseRef.current;
    inspectionMs.current = prior === 'inspection' ? Math.floor(performance.now() - started.current) : undefined;
    setAutomaticPenalty(inspectionMs.current === undefined ? 'none' : inspectionPenalty(inspectionMs.current));
    cancelHold(); started.current = performance.now(); setElapsed(0);
    if (current.current.settings.inputMethod === 'manual') setPhase('entry');
    else { setPhase('solving'); saveDraft('solving'); }
  };
  const primary = () => {
    if (saving || blockKeyboard) return;
    if (phaseRef.current === 'home' || phaseRef.current === 'complete' || phaseRef.current === 'engine-error') { void start(); return; }
    if (phaseRef.current === 'scramble') {
      const wait = current.current.settings.waitSeconds;
      setElapsed(wait * 1000); started.current = performance.now(); setPhase(wait > 0 ? 'waiting' : 'ready'); saveDraft(wait > 0 ? 'waiting' : 'ready'); return;
    }
    if (phaseRef.current === 'waiting') { setPhase('ready'); saveDraft('ready'); return; }
    if (phaseRef.current === 'ready') {
      const round = getRound();
      if (current.current.settings.inspection && round && getEvent(round.eventId).inspection) beginInspection();
      else if (current.current.settings.inputMethod === 'manual') beginSolve();
      return;
    }
    if (phaseRef.current === 'inspection' && current.current.settings.inputMethod === 'manual') beginSolve();
  };
  const record = async (rawMs: number | null, penalty: Penalty, inputMethod: 'timer' | 'manual') => {
    if (recordBusy.current) return false;
    const round = getRound(); const value = scrambleRef.current;
    if (!round || !value) return false;
    recordBusy.current = true;
    try {
      const attempt = createAttempt(round, { rawMs, penalty, inputMethod, scramble: value, inspectionMs: inspectionMs.current });
      lastAttemptRef.current = attempt; setLastAttempt(attempt);
      const updated = addAttempt(round, attempt);
      await mutate(s => browserStore.saveRound(updated, s.revision));
      telemetry.track('attempt_recorded', { eventId: round.eventId, inputMode: inputMethod, attemptToken: attempt.id, roundToken: round.id });
      if (updated.completedAt !== undefined) telemetry.track('round_completed', { eventId: round.eventId, format: round.format, attemptCount: updated.attempts.length, roundToken: round.id });
      return true;
    }
    catch (cause) { setError(cause instanceof StorageConflictError ? t('storageConflict') : t('saveError')); return false; }
    finally { recordBusy.current = false; }
  };
  const stop = (interrupted = false) => {
    if (phaseRef.current !== 'solving') return;
    const value = Math.max(0, Math.floor(performance.now() - started.current)); setElapsed(value); setPhase('confirm');
    if (interrupted) setNotice(t('interrupted'));
    void record(value, interrupted ? 'DNF' : 'none', 'timer');
  };
  const advance = async () => {
    const round = getRound(); if (!round || saving) return;
    const attempt = lastAttemptRef.current;
    if (attempt && !round.attempts.some(item => item.id === attempt.id)) {
      try { await mutate(s => browserStore.saveRound(addAttempt(round, attempt), s.revision)); } catch { return; }
    }
    const saved = getRound()!;
    if (saved.completedAt !== undefined) { setPhase('complete'); setNotice(null); return; }
    await generate(saved);
  };

  useEffect(() => {
    if (!['waiting', 'inspection', 'solving'].includes(phase)) return;
    let frame = 0;
    const tick = () => {
      const ms = performance.now() - started.current;
      if (phaseRef.current === 'waiting') {
        const remaining = Math.max(0, current.current.settings.waitSeconds * 1000 - ms); setElapsed(remaining);
        if (remaining === 0) { setPhase('ready'); saveDraft('ready'); return; }
      } else {
        setElapsed(ms);
        if (phaseRef.current === 'inspection' && current.current.settings.audioCallouts) for (const threshold of [8000, 12000]) if (ms >= threshold && !callouts.current.has(threshold)) { callouts.current.add(threshold); beep(); }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  // The clock reads live refs. Re-rendering must not reset it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const actions = useRef({ primary, stop, beginSolve, advance }); actions.current = { primary, stop, beginSolve, advance };
  useEffect(() => {
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing || editable(event.target) || blockKeyboard || !loaded) return;
      const active = phaseRef.current;
      if (active === 'solving') { event.preventDefault(); actions.current.stop(); return; }
      if (saving) return;
      const round = getRound();
      const canStart = current.current.settings.inputMethod === 'timer' && (active === 'inspection' || (active === 'ready' && (!current.current.settings.inspection || !round || !getEvent(round.eventId).inspection)));
      if (event.code === 'Space' && canStart) {
        event.preventDefault(); if (holdStart.current !== null) return;
        prepareAudio(); holdStart.current = performance.now(); setHolding(true);
        heldTimer.current = setTimeout(() => setArmed(true), current.current.settings.holdMs); return;
      }
      if ((event.code === 'Space' || event.code === 'Enter') && (['home', 'complete', 'scramble', 'waiting', 'ready', 'engine-error'].includes(active) || (active === 'inspection' && current.current.settings.inputMethod === 'manual'))) { event.preventDefault(); actions.current.primary(); }
      else if (event.code === 'Enter' && active === 'confirm') { event.preventDefault(); void actions.current.advance(); }
    };
    const keyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || holdStart.current === null) return;
      event.preventDefault(); const enough = performance.now() - holdStart.current >= current.current.settings.holdMs;
      if (!blockKeyboard && enough && ['inspection', 'ready'].includes(phaseRef.current)) actions.current.beginSolve(); else cancelHold();
    };
    const blur = () => { cancelHold(); if (phaseRef.current === 'solving') actions.current.stop(true); };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); };
  }, [blockKeyboard, loaded, saving, cancelHold]);

  const updateSettings = (patch: Partial<Settings>) => mutate(s => browserStore.saveSettings({ ...s.settings, ...patch }, s.revision));
  const home = () => { generation.current++; cancelHold(); setPhase('home'); setError(null); setNotice(null); };
  return { state, loaded, phase, scramble, error, notice, saving, elapsed, armed, holding, lastAttempt, automaticPenalty, mutate, updateSettings, primary, record, advance, home, setPhase, setError, apply, store: browserStore };
}
