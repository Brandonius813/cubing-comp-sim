import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Alert, AppState, BackHandler, Image, Linking,
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View, type GestureResponderEvent,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { useKeepAwake } from 'expo-keep-awake';
import { EVENTS, FORMAT_LABELS, getEvent } from '../src/core/events';
import { formatAttempt, formatTime, inspectionPenalty, MAX_TIME_MS } from '../src/core/timing';
import type { EventId, Penalty } from '../src/core/types';
import { MobileScrambleService, TnoodleEngineHost, type EngineStatus, type GeneratedScramble } from './src/engine';
import { createId } from '../src/core/rounds';
import { changeEvent, createDraft, recoverDraft, manualResult, pendingInspection, selectedPendingPenalty, selectPendingPenalty, navigationLocked, recordResult, type MobileSave, type PendingResult, type TimerPhase } from './src/practice';
import { loadSave, storeSave, storeDraft, replaceSave, restoreRecoverySave } from './src/storage';
import { NativeInspectionAudio } from './src/audio/native';
import { PracticeSettings } from './src/PracticeSettings';
import { AudioSettings } from './src/AudioSettings';
import { AccountPanel } from './src/accounts/AccountPanel';
import { Scorecard } from './src/Scorecard';
import { exportHistory, prepareHistoryReplacement } from './src/history';
import { TimerTouch } from './src/touch';


const PAGE_NAMES = ['Scorecard', 'Practice', 'Settings'] as const;
const color = { background: '#0d1118', panel: '#161e2a', border: '#293447', text: '#f4f7fc', muted: '#a5b2c7', blue: '#438cff', green: '#6ae1a5', red: '#ff8585' };

function Button({ label, onPress, disabled = false, secondary = false }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondaryButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={styles.buttonText}>{label}</Text>
  </Pressable>;
}

const ScrambleDrawing = memo(function ScrambleDrawing({ svg, eventName }: { svg: string; eventName: string }) {
  return <View accessible accessibilityLabel={`${eventName} scramble diagram`} style={styles.diagram}><SvgXml xml={svg} width="100%" height={135} /></View>;
});

function MobileApp() {
  useKeepAwake();
  const pager = useRef<PagerView>(null);
  const engine = useRef(new MobileScrambleService()).current;
  const audio = useRef(new NativeInspectionAudio()).current;
  const [audioError, setAudioError] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({ phase: 'loading' });
  const [engineKey, setEngineKey] = useState(0);
  const [save, setSave] = useState<MobileSave | null>(null);
  const saveRef = useRef<MobileSave | null>(null);
  const updateSave = (value: MobileSave) => { saveRef.current = value; setSave(value); };
  const [scorecardEditing, setScorecardEditing] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [phase, setPhase] = useState<TimerPhase>('ready');
  const phaseRef = useRef<TimerPhase>('ready');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [scramble, setScramble] = useState<GeneratedScramble | null>(null);
  const [generation, setGeneration] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(false);
  const [eventPicker, setEventPicker] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [manualError, setManualError] = useState('');
  const [inspectionInput, setInspectionInput] = useState('');
  const [draftError, setDraftError] = useState(false);
  const draftId = useRef(createId());
  const [waitRemaining, setWaitRemaining] = useState(0);
  const waitUntil = useRef(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [held, setHeld] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const solveStart = useRef(0);
  const holdStart = useRef(0);
  const inspectionStart = useRef<number | null>(null);
  const inspectionDuration = useRef<number | undefined>(undefined);
  const touch = useRef(new TimerTouch()).current;
  const inspectionTap = useRef(false);
  const eventId = save?.preferences.eventId ?? '333';
  const event = getEvent(eventId);
  const holdMs = save?.preferences.holdMs ?? 0;
  const activeRound = save?.history.rounds.find(round => round.id === save.history.activeRoundId);
  const practiceLocked = navigationLocked(phase, saving) || manualOpen || eventPicker || accountBusy;
  const locked = practiceLocked || scorecardEditing || importOpen;

  const transition = useCallback((next: TimerPhase) => { phaseRef.current = next; setPhase(next); }, []);
  const hydrate = (loaded: MobileSave) => {
    const recovered = recoverDraft(loaded);
    const draft = recovered.draft;
    draftId.current = draft?.id ?? createId();
    setScramble(draft?.scramble ?? null); setPending(draft?.pending ?? null);
    setManualInput(draft?.manualText ?? ''); setInspectionInput(draft?.inspectionText ?? '');
    inspectionStart.current = null; inspectionDuration.current = undefined;
    setElapsed(draft?.pending?.rawMs ?? 0); setWaitRemaining(draft?.waitRemainingMs ?? 0);
    waitUntil.current = performance.now() + (draft?.waitRemainingMs ?? 0);
    transition(draft?.phase ?? 'ready'); if (draft && navigationLocked(draft.phase, false)) { pager.current?.setPage(1); setPage(1); } updateSave(recovered); setDraftError(false);
    return recovered;
  };
  const openLocalSave = useCallback(() => {
    setLoadError(false);
    loadSave().then(async loaded => {
      const recovered = recoverDraft(loaded);
      await storeSave(recovered);
      hydrate(recovered);
    }).catch(() => setLoadError(true));
  }, []);
  useEffect(openLocalSave, [openLocalSave]);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const listener = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => listener.remove();
  }, []);

  const captureDraft = () => scramble && !save?.history.rounds.some(round => round.attempts.some(attempt => attempt.id === draftId.current)) ? {
    id: draftId.current, phase: phaseRef.current, scramble,
    ...(phaseRef.current === 'review' && pending ? { pending } : {}),
    manualText: manualInput, inspectionText: inspectionInput,
    waitRemainingMs: Math.max(0, Math.ceil(waitRemaining)),
  } : undefined;

  const commit = async (next: MobileSave, preserveDraft = true) => {
    if (savingRef.current) return false;
    savingRef.current = true; setSaving(true);
    try { const value = preserveDraft ? { ...next, draft: captureDraft() } : next; await storeSave(value); updateSave(value); setDraftError(false); return true; }
    catch { Alert.alert('Could not save', 'Your previous history is safe. Please try again.'); return false; }
    finally { savingRef.current = false; setSaving(false); }
  };

  useEffect(() => {
    if (!save || scramble || engineStatus.phase !== 'ready') return;
    let current = true;
    const controller = new AbortController();
    setGenerating(true); setGenerationError(false);
    engine.generate(eventId, { signal: controller.signal }).then(async next => {
      if (!current) return;
      if (savingRef.current || !saveRef.current || saveRef.current.preferences.eventId !== eventId) throw new Error('Practice changed while preparing. Retry.');
      const base = saveRef.current;
      const draft = createDraft(next, base.preferences);
      // Persist the exact fresh scramble before making it available to the timer.
      const written = await storeDraft(draft, base.history);
      if (!current) return;
      if (!written) throw new Error('History changed while preparing. Retry.');
      if (saveRef.current) saveRef.current = { ...saveRef.current, draft };
      draftId.current = draft.id; setScramble(next); setDraftError(false);
      setWaitRemaining(draft.waitRemainingMs ?? 0);
      waitUntil.current = performance.now() + (draft.waitRemainingMs ?? 0);
      transition(draft.phase);
    }).catch(() => { if (current) setGenerationError(true); })
      .finally(() => { if (current) setGenerating(false); });
    return () => { current = false; controller.abort(); };
    // History/settings changes do not replace an existing scramble.
  }, [engine, eventId, engineStatus.phase, generation, Boolean(save)]);

  useEffect(() => {
    if (!save || !scramble || saving || savingRef.current || generating) return;
    const draft = captureDraft();
    if (!draft) return;
    let current = true;
    void storeDraft(draft, save.history).then(written => { if (current) { setDraftError(!written); if (written && saveRef.current) saveRef.current = { ...saveRef.current, draft }; } })
      .catch(() => { if (current) setDraftError(true); });
    return () => { current = false; };
  }, [save, scramble, phase, pending, manualInput, inspectionInput, saving, generating, Math.ceil(waitRemaining / 1000)]);

  useEffect(() => {
    if (phase !== 'waiting') return;
    const tick = () => {
      if (!waitUntil.current) return;
      const remaining = Math.max(0, waitUntil.current - performance.now());
      setWaitRemaining(remaining);
      if (remaining === 0) transition('ready');
    };
    const interval = setInterval(tick, 200); tick();
    return () => clearInterval(interval);
  }, [phase, transition]);

  useEffect(() => {
    if (!['running', 'inspection', 'holding'].includes(phase)) return;
    let animation = 0;
    const tick = () => {
      const now = performance.now();
      if (phaseRef.current === 'running') setElapsed(Math.min(MAX_TIME_MS, now - solveStart.current));
      else if (inspectionStart.current !== null) setElapsed(now - inspectionStart.current);
      if (phaseRef.current === 'holding') setHeld(now - holdStart.current >= holdMs);
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [phase, holdMs]);

  const finish = useCallback((interrupted = false) => {
    audio.stop();
    const rawMs = phaseRef.current === 'running' ? Math.min(MAX_TIME_MS, Math.max(0, Math.floor(performance.now() - solveStart.current))) : null;
    setPending({ attemptId: draftId.current, rawMs, penalty: interrupted ? 'DNF' : 'none', inputMethod: 'timer', ...(interrupted ? { interrupted: true } : {}), ...(inspectionDuration.current !== undefined ? { inspectionMs: inspectionDuration.current } : {}) });
    setElapsed(rawMs ?? 0); setHeld(false); transition('review');
  }, [transition]);

  useEffect(() => {
    const interrupt = () => {
      const current = phaseRef.current;
      if (current === 'running' || current === 'inspection' || current === 'holding') {
        touch.cancel();
        finish(true);
        Alert.alert('Attempt interrupted', 'This attempt has been marked DNF for review. Save it when you return.');
      }
    };
    const listener = AppState.addEventListener('change', next => {
      if (next !== 'active') { audio.stop(); interrupt(); }
    });
    const blur = AppState.addEventListener('blur', interrupt);
    return () => { listener.remove(); blur.remove(); };
  }, [finish, touch]);

  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (locked) return true;
      if (page !== 1) { pager.current?.setPage(1); return true; }
      return false;
    });
    return () => listener.remove();
  }, [locked, page]);

  const audioSelection = () => ({ language: save?.preferences.voiceLanguage ?? 'en', voice: save?.preferences.voice ?? 'male-1', volume: save?.preferences.voiceVolume ?? 1 });
  useEffect(() => () => audio.stop(), [audio]);
  const beginSolve = () => {
    audio.stop();
    const now = performance.now();
    inspectionDuration.current = inspectionStart.current === null ? undefined : Math.max(0, Math.floor(now - inspectionStart.current));
    solveStart.current = now; setElapsed(0); setHeld(false); transition('running');
  };
  const startInspection = () => {
    inspectionStart.current = performance.now(); inspectionDuration.current = undefined;
    if (save?.preferences.inspectionAudio) {
      setAudioError(false); void audio.prepare(audioSelection()).catch(() => setAudioError(true));
      audio.start(inspectionStart.current);
    }
    setElapsed(0); transition('inspection');
  };
  const touchPoint = (event: GestureResponderEvent) => ({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY, at: performance.now() });
  const cancelTouch = () => {
    touch.cancel(); inspectionTap.current = false;
    if (phaseRef.current === 'holding') { setHeld(false); transition(inspectionStart.current === null ? 'ready' : 'inspection'); }
  };
  const touchStart = (nativeEvent: GestureResponderEvent) => {
    if (screenReader) return;
    if (!scramble || generating || savingRef.current || (draftError && phaseRef.current !== 'running')) return;
    const current = phaseRef.current;
    if (current === 'running') { finish(); return; }
    if (nativeEvent.nativeEvent.touches.length !== 1) { cancelTouch(); return; }
    if (current === 'review' || current === 'holding' || current === 'waiting') return;
    touch.begin(touchPoint(nativeEvent), nativeEvent.nativeEvent.touches.length);
    if (nativeEvent.nativeEvent.touches.length !== 1) { cancelTouch(); return; }
    if (current === 'ready' && save?.preferences.inspection && event.inspection) {
      inspectionTap.current = true; return;
    }
    holdStart.current = performance.now(); setHeld(holdMs === 0); transition('holding');
  };
  const touchMove = (event: GestureResponderEvent) => {
    if (screenReader) return;
    if (!touch.move(touchPoint(event), event.nativeEvent.touches.length)) cancelTouch();
  };
  const touchEnd = (event: GestureResponderEvent) => {
    if (screenReader) return;
    if (event.nativeEvent.touches.length !== 0) { cancelTouch(); return; }
    const duration = touch.end(touchPoint(event));
    if (duration === null) { cancelTouch(); return; }
    if (inspectionTap.current && phaseRef.current === 'ready') { inspectionTap.current = false; startInspection(); return; }
    if (phaseRef.current === 'holding' && duration >= holdMs) beginSolve();
    else cancelTouch();
  };
  const accessibleActivate = () => {
    if (!scramble || generating || savingRef.current || (draftError && phaseRef.current !== 'running')) return;
    if (phaseRef.current === 'running') finish();
    else if (phaseRef.current === 'ready' && save?.preferences.inspection && event.inspection) startInspection();
    else if (phaseRef.current === 'ready' || phaseRef.current === 'inspection') beginSolve();
  };
  const nextScramble = (requestNew = true) => {
    draftId.current = createId(); setManualInput(''); setInspectionInput(''); setManualError(''); setWaitRemaining(0); waitUntil.current = 0;
    setScramble(null); setPending(null); inspectionStart.current = null; inspectionDuration.current = undefined;
    setElapsed(0); transition('ready'); if (requestNew) setGeneration(value => value + 1);
  };
  const saveResult = async () => {
    if (!save || !scramble || !pending || savingRef.current) return;
    try {
      const next = recordResult(saveRef.current ?? save, scramble, pending);
      if (await commit(next, false)) nextScramble();
    } catch { Alert.alert('Could not record this attempt', 'Your result is still here. Please try again.'); }
  };
  const selectEvent = async (nextEvent: EventId) => {
    if (!save || savingRef.current) return;
    const apply = async () => {
      if (await commit(changeEvent(save, nextEvent), false)) { setEventPicker(false); nextScramble(nextEvent === eventId); }
    };
    if (activeRound) Alert.alert('End this round?', 'The unfinished round and its attempts will be discarded. Completed rounds remain saved.', [
      { text: 'Keep round', style: 'cancel' }, { text: 'End round', style: 'destructive', onPress: () => { void apply(); } },
    ]);
    else await apply();
  };
  const enterManual = () => {
    try {
      const result = manualResult(manualInput, save?.preferences.inspection && event.inspection ? inspectionInput : '', eventId, draftId.current);
      setPending(result); setElapsed(result.rawMs ?? 0); setManualOpen(false); transition('review');
    } catch (error) { setManualError(error instanceof Error ? error.message : 'Invalid time.'); }
  };
  const replaceHistory = async (source: string | MobileSave['history']) => {
    if (!saveRef.current || savingRef.current) throw new Error('Local history is busy. Try again.');
    const next = prepareHistoryReplacement(saveRef.current, source);
    savingRef.current = true; setSaving(true);
    try { await replaceSave(next); updateSave(next); nextScramble(); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const shareHistory = () => {
    if (save) void Share.share({ title: 'Cubing Comp Sim history', message: exportHistory(save) }).catch(() => Alert.alert('Export failed', 'Your history is unchanged.'));
  };
  const confirmImport = () => {
    if (!save) return;
    try {
      const prepared = prepareHistoryReplacement(save, importText);
      Alert.alert('Replace local history?', `Replace this device’s history with ${prepared.history.rounds.length} imported rounds? A recovery copy is kept.`, [
        { text: 'Cancel', style: 'cancel' }, { text: 'Replace', style: 'destructive', onPress: () => {
          void replaceHistory(prepared.history).then(() => { setImportOpen(false); setImportText(''); }).catch(() => Alert.alert('Import failed', 'Your previous history is unchanged.'));
        } },
      ]);
    } catch { Alert.alert('Invalid history', 'The entire file must be a valid Cubing Comp Sim export. Nothing was changed.'); }
  };
  const retryEngine = () => {
    if (phaseRef.current !== 'ready' || savingRef.current) return;
    setScramble(null); setEngineStatus({ phase: 'loading' }); setGenerationError(false); setEngineKey(value => value + 1);
  };

  const inspectionRunning = phase === 'inspection' || (phase === 'holding' && inspectionStart.current !== null);
  const inspectionLabel = inspectionRunning ? inspectionPenalty(elapsed) : 'none';
  const timerLabel = phase === 'running' ? 'Tap to stop' : phase === 'holding' ? held ? 'Release to start' : 'Keep holding' : phase === 'inspection' ? holdMs === 0 ? 'Tap and release to solve' : 'Hold, then release to solve' : phase === 'waiting' ? 'Waiting for your turn' : phase === 'review' ? 'Review your solve' : save?.preferences.inspection && event.inspection ? 'Tap to begin inspection' : holdMs === 0 ? 'Tap and release to solve' : 'Hold, then release to solve';

  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" />
    <TnoodleEngineHost key={engineKey} service={engine} onStatus={setEngineStatus} />
    <View style={styles.header}>
      <Image source={require('./assets/icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
      <View style={styles.headerCopy}><Text style={styles.brand}>Cubing Comp Sim</Text><Text style={styles.eyebrow}>MOBILE PREVIEW</Text></View>
      <View style={styles.localBadge}><View style={styles.localDot} /><Text style={styles.badgeText}>On device</Text></View>
    </View>

    {!save ? <View style={styles.centered}>
      {loadError ? <><Text style={styles.heading}>History could not be opened</Text><Text style={styles.body}>Your saved data has not been changed.</Text><Button label="Try again" onPress={openLocalSave} /></> : <><ActivityIndicator color={color.blue} /><Text style={styles.body}>Opening your practice history…</Text></>}
    </View> : <>
      <PagerView ref={pager} style={styles.pager} initialPage={1} scrollEnabled={!locked} overdrag={false}
        onPageSelected={event => setPage(event.nativeEvent.position)}>
        <View key="scorecard" collapsable={false} style={styles.page}>
          <Scorecard save={save} onSave={commit} disabled={practiceLocked || generating} onExport={shareHistory} onEditingChange={setScorecardEditing} />
        </View>

        <View key="practice" collapsable={false} style={styles.page}>
          <ScrollView contentContainerStyle={styles.content} scrollEnabled={!['running', 'holding'].includes(phase)} keyboardShouldPersistTaps="handled">
            <View style={styles.row}><View><Text style={styles.eyebrow}>COMPETITION PRACTICE</Text><Text style={styles.heading}>Make it count.</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Choose event. Current event ${event.name}`} disabled={locked} onPress={() => setEventPicker(true)} style={[styles.eventButton, locked && styles.disabled]}><Text style={styles.eventText}>{event.name} ▾</Text></Pressable>
            </View>
            <View style={styles.row}><Text style={styles.caption}>{FORMAT_LABELS[event.format]}</Text><Text style={styles.caption}>Solve {(activeRound?.attempts.length ?? 0) + 1} of {event.attemptCount}</Text></View>
            {audioError && <Text accessibilityRole="alert" style={styles.error}>Inspection audio is unavailable. Visual timing still works.</Text>}
            {draftError && <View style={styles.card}><Text accessibilityRole="alert" style={styles.error}>This draft could not be saved. Keep the app open and retry before continuing.</Text><Button label="Retry draft save" onPress={() => { const draft = captureDraft(); if (draft && saveRef.current) void storeDraft(draft, saveRef.current.history).then(written => setDraftError(!written)).catch(() => setDraftError(true)); }} /></View>}
            <View style={styles.scrambleCard}>
              <Text style={styles.eyebrow}>SCRAMBLE</Text>
              {scramble && !generating ? <>
                <Text selectable={phase === 'ready'} style={styles.notation}>{scramble.notation}</Text>
                <ScrambleDrawing svg={scramble.svg} eventName={event.name} />
              </> : engineStatus.phase === 'error' || generationError ? <><Text style={styles.body}>Scramble generation could not finish.</Text><Button label="Retry scramble engine" secondary disabled={phase !== 'ready' || saving} onPress={retryEngine} /></> : <View style={styles.loadingScramble}><ActivityIndicator color={color.blue} /><Text style={styles.body}>Preparing your scramble…</Text><Text style={styles.caption}>{engineStatus.generation ? `${Math.floor(engineStatus.generation.elapsedMs / 1000)} seconds elapsed` : 'Starting offline engine'}. The first scramble for some events takes longer.</Text></View>}
            </View>

            <View accessible accessibilityRole="button" accessibilityLabel={screenReader ? phase === 'running' ? 'Stop solve' : phase === 'inspection' ? 'Start solve' : timerLabel : timerLabel}
              accessibilityState={{ disabled: !scramble || generating || saving || phase === 'review' || phase === 'waiting' }}
              onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd} onTouchCancel={cancelTouch}
              onAccessibilityTap={Platform.OS === 'ios' ? accessibleActivate : undefined} accessibilityActions={Platform.OS === 'android' ? [{ name: 'activate' }] : undefined}
              onAccessibilityAction={Platform.OS === 'android' ? event => { if (event.nativeEvent.actionName === 'activate') accessibleActivate(); } : undefined}
              style={[styles.timerPad, phase === 'holding' && (held ? styles.armedPad : styles.holdPad), phase === 'running' && styles.runningPad]}>
              <Text style={styles.eyebrow}>{inspectionRunning ? 'INSPECTION' : phase === 'running' ? 'SOLVING' : 'READY WHEN YOU ARE'}</Text>
              <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.timer, phase === 'holding' && { color: held ? color.green : color.red }]}>
                {phase === 'waiting' ? `${Math.ceil(waitRemaining / 1000)}s` : inspectionRunning ? inspectionLabel === 'none' ? String(Math.max(0, 15 - Math.floor(elapsed / 1000))) : inspectionLabel : pending ? formatAttempt({ ...pending, inspectionPenalty: pendingInspection(pending, eventId) }) : formatTime(elapsed)}
              </Text>
              <Text style={styles.timerHint}>{screenReader && phase === 'inspection' ? 'Activate to start your solve' : timerLabel}</Text>
            </View>
            {(phase === 'ready' || phase === 'waiting') && activeRound && <Button label="End unfinished round" secondary disabled={saving || generating || accountBusy} onPress={() => { void selectEvent(eventId); }} />}
            {phase === 'inspection' && <Button label="Back to scramble" secondary onPress={() => { audio.stop(); inspectionStart.current = null; inspectionDuration.current = undefined; setElapsed(0); transition('ready'); }} />}
            {phase === 'review' && pending?.inputMethod === 'manual' && <Button label="Back to time entry" secondary disabled={saving} onPress={() => { setPending(null); transition('ready'); setManualOpen(true); }} />}
            {phase === 'ready' && <Button label="Enter a time manually" secondary disabled={!scramble || generating || saving || draftError} onPress={() => { setManualError(''); setManualOpen(true); }} />}
            {phase === 'review' && pending && <View style={styles.card}>
              <Text style={styles.cardTitle}>Save this solve</Text>
              {pending.interrupted && <Text style={styles.body}>This attempt was interrupted and must be saved as DNF.</Text>}
              {pending.inspectionMs !== undefined && inspectionPenalty(pending.inspectionMs) !== 'none' && <Text style={styles.body}>Measured inspection: {formatTime(pending.inspectionMs)}. The selected result includes inspection. Choose a penalty only to correct the final result.</Text>}
              <View style={styles.penalties}>{(['none', '+2', 'DNF', 'DNS'] as Penalty[]).map(penalty => <Pressable key={penalty} accessibilityRole="radio" accessibilityState={{ checked: selectedPendingPenalty(pending, eventId) === penalty, disabled: saving || (pending.interrupted && penalty !== 'DNF') || (pending.rawMs === null && penalty !== 'DNF' && penalty !== 'DNS') }}
                disabled={saving || (pending.interrupted && penalty !== 'DNF') || (pending.rawMs === null && penalty !== 'DNF' && penalty !== 'DNS')} onPress={() => { try { setPending(selectPendingPenalty(pending, penalty, eventId)); } catch {} }} style={[styles.penalty, selectedPendingPenalty(pending, eventId) === penalty && styles.selected]}><Text style={styles.buttonText}>{penalty === 'none' ? 'OK' : penalty}</Text></Pressable>)}</View>
              <Button label={saving ? 'Saving…' : 'Save and continue'} disabled={saving} onPress={() => { void saveResult(); }} />
            </View>}
          </ScrollView>
        </View>

        <View key="settings" collapsable={false} style={styles.page}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
            <Text style={styles.eyebrow}>MAKE IT YOURS</Text><Text style={styles.heading}>Settings</Text>
            <PracticeSettings preferences={save.preferences} disabled={saving || accountBusy} onChange={preferences => commit({ ...saveRef.current!, preferences })} />
            <AudioSettings preferences={save.preferences} disabled={saving || accountBusy} onChange={preferences => commit({ ...saveRef.current!, preferences })} onPreview={() => { setAudioError(false); void audio.preview(audioSelection()).catch(() => { setAudioError(true); Alert.alert('Voice unavailable', 'The recording could not be played.'); }); }} />
            <View style={styles.card}><AccountPanel getSnapshot={() => saveRef.current!.history} disabled={saving || generating} onBusyChange={setAccountBusy} replaceSnapshot={async (snapshot, expectedLocal) => {
              if (JSON.stringify(saveRef.current?.history) !== JSON.stringify(expectedLocal)) throw new Error('Local history changed. Start the download again.');
              await replaceHistory(snapshot);
            }} /></View>
            <View style={styles.card}><Text style={styles.cardTitle}>Local history</Text><Text style={styles.body}>Exports contain solve history only, never account credentials. Imports keep a recovery copy.</Text>
              <Button label="Share history JSON" secondary onPress={shareHistory} disabled={saving || generating || accountBusy} />
              <Button label="Import history JSON" secondary onPress={() => setImportOpen(true)} disabled={saving || generating || accountBusy} />
              <Button label="Restore previous replacement" secondary disabled={saving || generating || accountBusy} onPress={() => Alert.alert('Restore recovery copy?', 'Your current history will become the recovery copy. This replaces local history only.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Restore', style: 'destructive', onPress: () => { if (savingRef.current) return; savingRef.current = true; setSaving(true); void restoreRecoverySave().then(async next => { const recovered = recoverDraft(next); await storeSave(recovered); hydrate(recovered); setGeneration(value => value + 1); }).catch(() => Alert.alert('Recovery unavailable', 'No valid recovery copy could be restored. Your current history is unchanged.')).finally(() => { savingRef.current = false; setSaving(false); }); } }])} />
            </View>
            <View style={styles.card}><Text style={styles.cardTitle}>About</Text><Text style={styles.body}>Simulate a Cubing Competition.</Text><Text style={styles.body}>Built by Brandon True. Free and open source.</Text><Button label="Source code & licenses" secondary onPress={() => { void Linking.openURL('https://github.com/Brandonius813/cubing-comp-sim').catch(() => Alert.alert('Could not open link', 'Please try again when a browser is available.')); }} /></View>
          </ScrollView>
        </View>
      </PagerView>
      {locked && <Text accessibilityLiveRegion="polite" style={[styles.caption, { textAlign: 'center' }]}>Finish or review this attempt to change pages.</Text>}
      <View style={styles.navigation} accessibilityRole="tablist">
        {PAGE_NAMES.map((name, index) => <Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{ selected: page === index, disabled: locked }} disabled={locked} onPress={() => pager.current?.setPage(index)} style={[styles.navItem, page === index && styles.navActive, locked && styles.disabled]}><Text style={[styles.navText, page === index && { color: color.text }]}>{name}</Text><View style={[styles.navDot, page === index && { backgroundColor: color.blue }]} /></Pressable>)}
      </View>
    </>}

    <Modal visible={eventPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!saving) setEventPicker(false); }}>
      <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}><Text style={styles.heading}>Choose your event</Text>
        <Button label="Cancel" secondary disabled={saving} onPress={() => setEventPicker(false)} />
        {EVENTS.map(item => <Button key={item.id} label={item.name} secondary={item.id !== eventId} disabled={saving} onPress={() => { void selectEvent(item.id); }} />)}
      </ScrollView></SafeAreaView>
    </Modal>
    <Modal visible={importOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!saving) setImportOpen(false); }}>
      <SafeAreaView style={styles.safe}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Text style={styles.heading}>Import history</Text><Text style={styles.body}>Paste the full JSON from a Cubing Comp Sim history export. Import replaces local history after confirmation.</Text>
        <TextInput accessibilityLabel="History JSON" multiline value={importText} onChangeText={setImportText} autoCapitalize="none" autoCorrect={false} style={[styles.input, { minHeight: 200, fontSize: 14 }]} editable={!saving} />
        <Button label="Validate and replace" disabled={saving} onPress={confirmImport} /><Button label="Cancel" secondary disabled={saving} onPress={() => setImportOpen(false)} />
      </ScrollView></SafeAreaView>
    </Modal>
    <Modal visible={manualOpen} transparent animationType="fade" onRequestClose={() => setManualOpen(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalCard}><Text style={styles.heading}>Enter your time</Text><Text style={styles.body}>10321 becomes 1:03.21. You can also enter DNF or DNS.</Text>
        {save?.preferences.inspection && event.inspection && <TextInput accessibilityLabel="Inspection time" value={inspectionInput} onChangeText={setInspectionInput} placeholder="Inspection (optional): 15.00" placeholderTextColor={color.muted} style={styles.input} keyboardType="decimal-pad" />}
        <TextInput autoFocus accessibilityLabel="Solve time" value={manualInput} onChangeText={setManualInput} autoCapitalize="characters" autoCorrect={false} placeholder="12.34" placeholderTextColor={color.muted} style={styles.input} returnKeyType="done" onSubmitEditing={enterManual} />
        {manualError ? <Text accessibilityRole="alert" style={styles.error}>{manualError}</Text> : null}
        <Button label="Review time" onPress={enterManual} /><Button label="Cancel" secondary onPress={() => setManualOpen(false)} />
      </ScrollView></KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><MobileApp /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderColor: color.border },
  logo: { width: 34, height: 34, borderRadius: 8 }, headerCopy: { flex: 1, gap: 4 }, brand: { color: color.text, fontSize: 17, fontWeight: '700' },
  localBadge: { flexDirection: 'row', gap: 6, alignItems: 'center' }, localDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: color.green }, badgeText: { color: color.muted, fontSize: 11 },
  pager: { flex: 1 }, page: { flex: 1 }, content: { padding: 20, gap: 18, width: '100%', maxWidth: 760, alignSelf: 'center', paddingBottom: 32 },
  eyebrow: { color: color.muted, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 }, heading: { color: color.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.8 },
  body: { color: color.muted, fontSize: 15, lineHeight: 23 }, caption: { color: color.muted, fontSize: 13, lineHeight: 20 }, muted: { color: color.muted },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }, card: { borderWidth: 1, borderColor: color.border, borderRadius: 20, backgroundColor: color.panel, padding: 20, gap: 16 },
  cardTitle: { color: color.text, fontSize: 19, fontWeight: '600' }, sectionTitle: { color: color.text, fontSize: 20, fontWeight: '600', marginTop: 10 },
  solveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: color.border, paddingBottom: 12 }, result: { color: color.text, fontVariant: ['tabular-nums'], fontSize: 22, fontWeight: '600' }, scoreTotal: { paddingTop: 5 },
  eventButton: { minHeight: 44, justifyContent: 'center', backgroundColor: color.panel, borderWidth: 1, borderColor: color.border, paddingHorizontal: 14, borderRadius: 12, maxWidth: '100%' }, eventText: { color: color.text, fontSize: 15, fontWeight: '600' },
  scrambleCard: { borderWidth: 1, borderColor: color.border, borderRadius: 20, padding: 18, gap: 14 }, notation: { color: color.text, fontSize: 19, lineHeight: 29, fontWeight: '500', textAlign: 'center' }, diagram: { alignItems: 'center', justifyContent: 'center', minHeight: 135, padding: 6, borderRadius: 12, backgroundColor: '#edf2fa' },
  loadingScramble: { minHeight: 140, justifyContent: 'center', alignItems: 'center', gap: 10 }, timerPad: { minHeight: 215, justifyContent: 'center', alignItems: 'center', gap: 12, borderRadius: 24, borderWidth: 1, borderColor: color.border, backgroundColor: color.panel, padding: 18 },
  holdPad: { borderColor: color.red }, armedPad: { borderColor: color.green }, runningPad: { borderColor: color.blue }, timer: { color: color.text, fontSize: 68, fontWeight: '600', fontVariant: ['tabular-nums'], width: '100%', textAlign: 'center', letterSpacing: -3 }, timerHint: { color: color.muted, textAlign: 'center', fontSize: 14 },
  button: { backgroundColor: '#286ad5', minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 }, secondaryButton: { backgroundColor: color.panel, borderWidth: 1, borderColor: color.border }, buttonText: { color: color.text, fontSize: 15, fontWeight: '600', textAlign: 'center' }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.75 },
  penalties: { flexDirection: 'row', gap: 8 }, penalty: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.border, borderRadius: 10 }, selected: { backgroundColor: '#23436d', borderColor: color.blue },
  settingCopy: { flex: 1, minWidth: 180, gap: 4 }, settingLabel: { color: color.text, fontSize: 16 },
  navigation: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 5, gap: 8, borderTopWidth: 1, borderColor: color.border }, navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 48, borderRadius: 12 }, navActive: { backgroundColor: color.panel }, navText: { color: color.muted, fontSize: 13, fontWeight: '600' }, navDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 }, modalBackdrop: { flex: 1, backgroundColor: '#00000099', justifyContent: 'center', padding: 24 }, modalCard: { alignSelf: 'center', width: '100%', maxWidth: 480, backgroundColor: color.panel, borderWidth: 1, borderColor: color.border, borderRadius: 22, padding: 24, gap: 16 }, input: { minHeight: 56, color: color.text, borderWidth: 1, borderColor: color.border, borderRadius: 12, fontSize: 26, padding: 12, fontVariant: ['tabular-nums'] }, error: { color: color.red, fontSize: 14 },
});
