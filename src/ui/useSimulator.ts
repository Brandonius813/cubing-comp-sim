import { useCallback, useEffect, useRef, useState } from 'react';
import { addAttempt, createAttempt, createRound, getEvent, inspectionPenalty, type Attempt, type EventId, type Penalty, type Round, type Scramble } from '../core';
import { BrowserStore, DEFAULT_SETTINGS, StorageConflictError, type LocalState, type Settings } from '../storage';
import { createScrambleService } from '../scramble';
import { inspectionPhrase, t } from './i18n';
import { InspectionAudio, takeInspectionCue } from '../audio/inspection';
import { getAudioPreferences } from '../audio/preferences';
import { telemetry } from '../telemetry';
import { sampleWaitMs, simulatorKeyAction } from './simulatorInput';

export type Phase = 'home' | 'loading' | 'scramble' | 'waiting' | 'ready' | 'inspection' | 'solving' | 'entry' | 'confirm' | 'complete' | 'engine-error';
const initial: LocalState = { revision: 0, rounds: [], activeRoundId: null, settings: { ...DEFAULT_SETTINGS }, draft: null };
export const browserStore = new BrowserStore();

export function useSimulator(blockKeyboard: boolean) {
  const [state, setState] = useState<LocalState>(initial);
  const current = useRef(state);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhaseState] = useState<Phase>('home');
  const phaseRef = useRef(phase);
  const audio = useRef<InspectionAudio | null>(null);
  const setPhase = useCallback((next: Phase) => { if (next !== 'inspection') audio.current?.cancel(); phaseRef.current = next; setPhaseState(next); }, []);
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
  const waitDuration = useRef(0);
  const pressedKeys = useRef(new Set<string>());
  const holdStart = useRef<number | null>(null);
  const heldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callouts = useRef(new Set<number>());
  const generation = useRef(0);
  const recordBusy = useRef(false);
  const endingRound = useRef(false);
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
  useEffect(() => () => { engine.current?.dispose(); cancelHold(); audio.current?.dispose(); audio.current = null; }, [cancelHold]);

  const prepareAudio = () => {
    try { audio.current ??= new InspectionAudio(); void audio.current.prepare(); } catch { /* Sound must not gate timing. */ }
  };
  const saveDraft = (stage: 'scramble' | 'waiting' | 'ready' | 'inspection' | 'solving') => {
    if (endingRound.current) return;
    const round = getRound(); const value = scrambleRef.current;
    const request = generation.current;
    if (round && value) void mutate(s => request !== generation.current || endingRound.current
      ? Promise.resolve(s)
      : browserStore.saveDraft({ roundId: round.id, scramble: value, stage, savedAt: Date.now() }, s.revision)).catch(() => undefined);
  };
  const generate = async (round: Round) => {
    if (endingRound.current || getRound()?.id !== round.id) return;
    const request = ++generation.current; setPhase('loading'); setError(null); setNotice(null);
    cancelHold(); setAutomaticPenalty('none'); inspectionMs.current = undefined;
    try {
      engine.current ??= createScrambleService();
      const generated = await engine.current.generate(round.eventId);
      if (request !== generation.current) return;
      const value: Scramble = { ...generated, eventId: round.eventId };
      await mutate(s => request !== generation.current || endingRound.current
        ? Promise.resolve(s)
        : browserStore.saveDraft({ roundId: round.id, scramble: value, stage: 'scramble', savedAt: Date.now() }, s.revision));
      if (request !== generation.current) return;
      setScramble(value); scrambleRef.current = value; setPhase('scramble');
    } catch (cause) {
      if (request !== generation.current) return;
      setError(cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENGINE_UNAVAILABLE' ? t('engineError') : cause instanceof StorageConflictError ? t('storageConflict') : t('generationError'));
      telemetry.reportError('scramble_failed', { eventId: round.eventId, code: 'GENERATION_FAILED' });
      setPhase('engine-error');
    }
  };
  const start = async () => {
    if (!loaded || saving || endingRound.current || phaseRef.current === 'loading') return;
    const request = generation.current;
    setPhase('loading');
    let round = getRound();
    if (!round || round.completedAt !== undefined || round.eventId !== current.current.settings.eventId) {
      round = createRound(current.current.settings.eventId, { goalMs: current.current.settings.goalMs ?? undefined });
      try {
        await mutate(s => request !== generation.current || endingRound.current ? Promise.resolve(s) : browserStore.saveRound(round!, s.revision));
        if (request !== generation.current || endingRound.current) return;
        telemetry.track('round_started', { eventId: round.eventId, inputMode: current.current.settings.inputMethod, roundToken: round.id });
      } catch { if (request === generation.current) setPhase('home'); return; }
    }
    if (request !== generation.current || endingRound.current) return;
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
    if (blockKeyboard || !loaded || endingRound.current) return;
    if (phaseRef.current === 'home' || phaseRef.current === 'complete' || phaseRef.current === 'engine-error') { void start(); return; }
    if (phaseRef.current === 'scramble') {
      const wait = sampleWaitMs(current.current.settings);
      waitDuration.current = wait;
      setElapsed(wait); started.current = performance.now(); setPhase(wait > 0 ? 'waiting' : 'ready'); saveDraft(wait > 0 ? 'waiting' : 'ready'); return;
    }
    if (phaseRef.current === 'ready') {
      const round = getRound();
      if (current.current.settings.inspection && round && getEvent(round.eventId).inspection) beginInspection();
      else if (current.current.settings.inputMethod === 'manual') beginSolve();
      return;
    }
    if (phaseRef.current === 'inspection' && current.current.settings.inputMethod === 'manual') beginSolve();
  };
  const record = async (rawMs: number | null, penalty: Penalty, inputMethod: 'timer' | 'manual') => {
    if (recordBusy.current || endingRound.current) return false;
    const request = generation.current;
    const round = getRound(); const value = scrambleRef.current;
    if (!round || !value) return false;
    recordBusy.current = true;
    try {
      const attempt = createAttempt(round, { rawMs, penalty, inputMethod, scramble: value, inspectionMs: inspectionMs.current });
      lastAttemptRef.current = attempt; setLastAttempt(attempt);
      const updated = addAttempt(round, attempt);
      await mutate(s => request !== generation.current || endingRound.current ? Promise.resolve(s) : browserStore.saveRound(updated, s.revision));
      if (request !== generation.current || endingRound.current) return false;
      telemetry.track('attempt_recorded', { eventId: round.eventId, inputMode: inputMethod, attemptToken: attempt.id, roundToken: round.id });
      if (updated.completedAt !== undefined) telemetry.track('round_completed', { eventId: round.eventId, format: round.format, attemptCount: updated.attempts.length, roundToken: round.id });
      return true;
    }
    catch (cause) { if (request === generation.current) setError(cause instanceof StorageConflictError ? t('storageConflict') : t('saveError')); return false; }
    finally { recordBusy.current = false; }
  };
  const stop = (interrupted = false) => {
    if (phaseRef.current !== 'solving' || endingRound.current) return;
    const value = Math.max(0, Math.floor(performance.now() - started.current)); setElapsed(value); setPhase('confirm');
    if (interrupted) setNotice(t('interrupted'));
    void record(value, interrupted ? 'DNF' : 'none', 'timer');
  };
  const advance = async () => {
    const round = getRound(); if (!round || saving || recordBusy.current || endingRound.current || phaseRef.current === 'loading') return;
    const request = generation.current;
    const attempt = lastAttemptRef.current;
    if (attempt && !round.attempts.some(item => item.id === attempt.id)) {
      try { await mutate(s => request !== generation.current || endingRound.current ? Promise.resolve(s) : browserStore.saveRound(addAttempt(round, attempt), s.revision)); } catch { return; }
    }
    if (request !== generation.current || endingRound.current) return;
    const saved = getRound();
    if (!saved || saved.id !== round.id) return;
    if (saved.completedAt !== undefined) { setPhase('complete'); setNotice(null); return; }
    await generate(saved);
  };

  useEffect(() => {
    if (!['waiting', 'inspection', 'solving'].includes(phase)) return;
    let frame = 0;
    const tick = () => {
      const ms = performance.now() - started.current;
      if (phaseRef.current === 'waiting') {
        const remaining = Math.max(0, waitDuration.current - ms); setElapsed(remaining);
        if (remaining === 0) { setPhase('ready'); saveDraft('ready'); return; }
      } else {
        setElapsed(ms);
        if (phaseRef.current === 'inspection') {
          const cue = takeInspectionCue(ms, callouts.current);
          if (cue !== null && !document.hidden) {
            const preferences = getAudioPreferences();
            const language = preferences.voiceLanguage === 'follow' ? current.current.settings.language : preferences.voiceLanguage;
            audio.current?.cue(language, inspectionPhrase(language, cue), preferences,
              () => phaseRef.current === 'inspection' && !document.hidden);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame);
  // The clock reads live refs. Re-rendering must not reset it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const actions = useRef({ primary, stop, beginSolve, advance }); actions.current = { primary, stop, beginSolve, advance };
  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented || blockKeyboard || !loaded) return;
      const active = phaseRef.current;
      if (active !== 'solving' && (event.ctrlKey || event.metaKey || event.altKey)) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const entryForm = active === 'entry' ? document.querySelector<HTMLFormElement>('form[data-solve-entry]') : null;
      const entryInput = entryForm && target instanceof HTMLInputElement && entryForm.contains(target);
      const builtIn = ['Space', 'Enter', 'NumpadEnter'].includes(event.code);
      // Numeric solve entry accepts both advance keys. Other editable controls
      // keep their normal typing and selection behavior, including extra shortcuts.
      if (active !== 'solving' && target?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="option"]')
        && !(entryInput && builtIn)) return;
      const control = target?.closest('button, a, [role="button"]');
      if (active !== 'solving' && control && !control.matches('.flow-button, [data-simulator-action]')
        && !(entryForm?.contains(control) && control.matches('button[type="submit"]'))) return;
      const round = getRound();
      const canStart = round !== null && scrambleRef.current !== null && current.current.settings.inputMethod === 'timer'
        && (active === 'inspection' || (active === 'ready' && (!current.current.settings.inspection || !getEvent(round.eventId).inspection)));
      const action = simulatorKeyAction(event.code, active, current.current.settings.inputMethod, canStart, current.current.settings.shortcuts);
      // Prevent the native focused-button action and scrolling even on repeats.
      if (action || builtIn && ['waiting', 'loading', 'inspection'].includes(active)) event.preventDefault();
      if (event.repeat || pressedKeys.current.has(event.code)) return;
      pressedKeys.current.add(event.code);
      if (action === 'stop') { actions.current.stop(); return; }
      if (action === 'hold') {
        if (holdStart.current !== null) return;
        prepareAudio(); holdStart.current = performance.now(); setHolding(true);
        heldTimer.current = setTimeout(() => {
          if (holdStart.current !== null && ['inspection', 'ready'].includes(phaseRef.current)) setArmed(true);
        }, current.current.settings.holdMs);
        return;
      }
      if (action === 'primary') actions.current.primary();
      else if (action === 'submit' && !saving && !recordBusy.current) {
        if (active === 'entry') entryForm?.requestSubmit();
        else void actions.current.advance();
      }
    };
    const keyUp = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.code);
      if (event.code !== 'Space' || holdStart.current === null) return;
      event.preventDefault();
      const enough = performance.now() - holdStart.current >= current.current.settings.holdMs;
      if (!blockKeyboard && enough && ['inspection', 'ready'].includes(phaseRef.current)) actions.current.beginSolve();
      else cancelHold();
    };
    const blur = () => {
      pressedKeys.current.clear(); audio.current?.cancel(); cancelHold();
      if (phaseRef.current === 'solving') actions.current.stop(true);
    };
    window.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp); window.removeEventListener('blur', blur); };
  }, [blockKeyboard, loaded, saving, cancelHold]);

  const endRound = async (nextEventId?: EventId): Promise<boolean> => {
    if (!loaded || endingRound.current) return false;
    endingRound.current = true;
    const previousPhase = phaseRef.current;
    // Invalidate generation and queued draft/result writes before queuing the
    // atomic discard. Already-running writes finish first and are then removed.
    generation.current++; cancelHold(); audio.current?.cancel();
    try {
      await mutate(s => browserStore.discardActiveRound(s.revision, nextEventId));
      scrambleRef.current = null; setScramble(null);
      lastAttemptRef.current = null; setLastAttempt(null);
      inspectionMs.current = undefined; waitDuration.current = 0;
      setAutomaticPenalty('none'); setElapsed(0); setNotice(null); setPhase('home');
      return true;
    } catch {
      // Existing data and clocks remain intact after a failed transaction. A
      // cancelled generation can be retried instead of leaving an endless loader.
      if (previousPhase === 'loading') setPhase('engine-error');
      return false;
    } finally { endingRound.current = false; }
  };

  const updateSettings = (patch: Partial<Settings>) => mutate(s => browserStore.saveSettings({ ...s.settings, ...patch }, s.revision));
  const home = () => { generation.current++; cancelHold(); setPhase('home'); setError(null); setNotice(null); };
  return { state, loaded, phase, scramble, error, notice, saving, elapsed, armed, holding, lastAttempt, automaticPenalty, mutate, updateSettings, primary, record, advance, endRound, home, setPhase, setError, apply, store: browserStore };
}
