import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import {
  AccessibilityInfo,
  Alert,
  AppState,
  BackHandler,
  Keyboard,
  Linking,
  useColorScheme,
  useWindowDimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
} from "react-native";
import PagerView from "react-native-pager-view";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { useKeepAwake } from "expo-keep-awake";
import { getEvent } from "../src/core/events";
import {
  formatAttempt,
  formatTime,
  inspectionPenalty,
  MAX_TIME_MS,
} from "../src/core/timing";
import type { EventId } from "../src/core/types";
import {
  MobileScrambleService,
  TnoodleEngineHost,
  type EngineStatus,
  type GeneratedScramble,
} from "./src/engine";
import { createId } from "../src/core/rounds";
import {
  changeEvent,
  createDraft,
  confirmScramble,
  recoverDraft,
  manualResult,
  pendingInspection,
  selectedPendingPenalty,
  selectPendingPenalty,
  validatePendingResult,
  recordResult,
  type MobileSave,
  type PendingResult,
  type TimerPhase,
} from "./src/practice";
import { loadSave, storeSave, storeDraft, replaceSave } from "./src/storage";
import { NativeInspectionAudio } from "./src/audio/native";
import { PracticeSettings } from "./src/PracticeSettings";
import { AudioSettings } from "./src/AudioSettings";
import { AccountPanel } from "./src/accounts/AccountPanel";
import { TimeEditor } from "./src/TimeEditor";
import { Scorecard, RoundCard } from "./src/Scorecard";
import { exportHistory, prepareHistoryReplacement } from "./src/history";
import { pagingLocked } from "./src/navigation";
import { TimerTouch } from "./src/touch";
import {
  MobileThemeProvider,
  PagerInteractionContext,
  resolveMobileTheme,
  useMobileTheme,
} from "./src/ui";

function Button({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        justifyContent: "center",
        paddingVertical: 10,
        paddingHorizontal: 22,
        borderWidth: 1,
        borderColor: theme.accent,
        borderRadius: 10,
        alignItems: "center",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text
        style={{
          color: theme.accent,
          fontSize: 17,
          fontFamily: theme.fontFamily,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
function ThinkingDots() {
  const theme = useMobileTheme();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((n) => (n + 1) % 3), 400);
    return () => clearInterval(id);
  }, []);
  return (
    <View
      accessible
      accessibilityLabel="Preparing scramble"
      style={{ flexDirection: "row", gap: 6, padding: 16 }}
    >
      {[0, 1, 2].map((n) => (
        <View
          key={n}
          style={{
            width: 5,
            height: 5,
            borderRadius: 3,
            backgroundColor: theme.muted,
            opacity: n === step ? 1 : 0.25,
          }}
        />
      ))}
    </View>
  );
}

function MobileApp() {
  useKeepAwake();
  const pager = useRef<PagerView>(null);
  const engine = useRef(new MobileScrambleService()).current;
  const audio = useRef(new NativeInspectionAudio()).current;
  const [audioError, setAudioError] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({
    phase: "loading",
  });
  const [engineKey, setEngineKey] = useState(0);
  const [save, setSave] = useState<MobileSave | null>(null);
  const saveRef = useRef<MobileSave | null>(null);
  const updateSave = (value: MobileSave) => {
    saveRef.current = value;
    setSave(value);
  };
  const [interacting, setInteracting] = useState(false);
  const interactingRef = useRef(false);
  const setPagerInteraction = useCallback((active: boolean) => {
    interactingRef.current = active;
    setInteracting(active);
    pager.current?.setScrollEnabled(!pagingLocked(phaseRef.current, active));
  }, []);
  const [completedRoundId, setCompletedRoundId] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState(false);
  const summaryTouchY = useRef(0);
  const [scorecardEditing, setScorecardEditing] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [page, setPage] = useState(1);
  const [phase, setPhase] = useState<TimerPhase>("scramble");
  const phaseRef = useRef<TimerPhase>("scramble");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [scramble, setScramble] = useState<GeneratedScramble | null>(null);
  const [generation, setGeneration] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(false);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [manualError, setManualError] = useState("");
  const [inspectionInput, setInspectionInput] = useState("");
  const [draftError, setDraftError] = useState(false);
  const draftId = useRef(createId());
  const [waitRemaining, setWaitRemaining] = useState(0);
  const waitUntil = useRef(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [pending, setPending] = useState<PendingResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [held, setHeld] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const solveStart = useRef(0);
  const holdStart = useRef(0);
  const inspectionStart = useRef<number | null>(null);
  const inspectionDuration = useRef<number | undefined>(undefined);
  const touch = useRef(new TimerTouch()).current;
  const stoppedTouch = useRef(false);
  const inspectionTap = useRef(false);
  const eventId = save?.preferences.eventId ?? "333";
  const event = getEvent(eventId);
  const holdMs = save?.preferences.holdMs ?? 0;
  const activeRound = save?.history.rounds.find(
    (round) => round.id === save.history.activeRoundId,
  );
  const activeClock = ["running", "inspection", "holding"].includes(phase);
  const manualMode = save?.preferences.inputMethod === "manual";
  const manualEntry = manualMode && phase === "ready" && manualOpen;
  const theme = resolveMobileTheme(
    save?.preferences ?? { eventId: "333", inspection: true },
    useColorScheme(),
  );
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const { width, height } = useWindowDimensions();

  const transition = useCallback((next: TimerPhase) => {
    phaseRef.current = next;
    setPhase(next);
    pager.current?.setScrollEnabled(
      !pagingLocked(next, interactingRef.current),
    );
  }, []);
  const drawScramble = useCallback(
    (id: EventId, notation: string, signal?: AbortSignal) =>
      engine.draw(id, notation, signal),
    [engine],
  );
  const hydrate = (loaded: MobileSave) => {
    const recovered = recoverDraft(loaded);
    const draft = recovered.draft;
    draftId.current = draft?.id ?? createId();
    setScramble(draft?.scramble ?? null);
    setPending(draft?.pending ?? null);
    setManualInput(draft?.manualText ?? "");
    setInspectionInput(draft?.inspectionText ?? "");
    inspectionStart.current = null;
    inspectionDuration.current = undefined;
    setElapsed(draft?.pending?.rawMs ?? 0);
    setWaitRemaining(draft?.waitRemainingMs ?? 0);
    waitUntil.current = performance.now() + (draft?.waitRemainingMs ?? 0);
    transition(draft?.phase ?? "scramble");
    setManualOpen(Boolean(draft?.manualText || draft?.inspectionText));
    updateSave(recovered);
    setDraftError(false);
    return recovered;
  };
  const openLocalSave = useCallback(() => {
    setLoadError(false);
    loadSave()
      .then(async (loaded) => {
        const recovered = recoverDraft(loaded);
        await storeSave(recovered);
        hydrate(recovered);
      })
      .catch(() => setLoadError(true));
  }, []);
  useEffect(openLocalSave, [openLocalSave]);
  useEffect(() => {
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const listener = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReader,
    );
    return () => listener.remove();
  }, []);

  const captureDraft = () =>
    scramble &&
    !save?.history.rounds.some((round) =>
      round.attempts.some((attempt) => attempt.id === draftId.current),
    )
      ? {
          id: draftId.current,
          phase: phaseRef.current,
          scramble,
          ...(phaseRef.current === "review" && pending ? { pending } : {}),
          manualText: manualInput,
          inspectionText: inspectionInput,
          waitRemainingMs: Math.max(0, Math.ceil(waitRemaining)),
        }
      : undefined;

  const commit = async (next: MobileSave, preserveDraft = true) => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      const value = preserveDraft ? { ...next, draft: captureDraft() } : next;
      await storeSave(value);
      updateSave(value);
      setDraftError(false);
      return true;
    } catch {
      Alert.alert(
        "Could not save",
        "Your previous history is safe. Please try again.",
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!save || scramble || completedRoundId || engineStatus.phase !== "ready")
      return;
    let current = true;
    const controller = new AbortController();
    setGenerating(true);
    setGenerationError(false);
    engine
      .generate(eventId, { signal: controller.signal })
      .then(async (next) => {
        if (!current) return;
        if (
          savingRef.current ||
          !saveRef.current ||
          saveRef.current.preferences.eventId !== eventId
        )
          throw new Error("Practice changed while preparing. Retry.");
        const base = saveRef.current;
        const draft = createDraft(next, base.preferences);
        // Persist the exact fresh scramble before making it available to the timer.
        const written = await storeDraft(draft, base.history);
        if (!current) return;
        if (!written)
          throw new Error("History changed while preparing. Retry.");
        if (saveRef.current) saveRef.current = { ...saveRef.current, draft };
        draftId.current = draft.id;
        setScramble(next);
        setDraftError(false);
        setWaitRemaining(draft.waitRemainingMs ?? 0);
        waitUntil.current = performance.now() + (draft.waitRemainingMs ?? 0);
        transition(draft.phase);
      })
      .catch(() => {
        if (current) setGenerationError(true);
      })
      .finally(() => {
        if (current) setGenerating(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
    // History/settings changes do not replace an existing scramble.
  }, [
    engine,
    eventId,
    engineStatus.phase,
    generation,
    Boolean(save),
    completedRoundId,
  ]);

  useEffect(() => {
    if (!save || !scramble || saving || savingRef.current || generating) return;
    const draft = captureDraft();
    if (!draft) return;
    let current = true;
    void storeDraft(draft, save.history)
      .then((written) => {
        if (current) {
          setDraftError(!written);
          if (written && saveRef.current)
            saveRef.current = { ...saveRef.current, draft };
        }
      })
      .catch(() => {
        if (current) setDraftError(true);
      });
    return () => {
      current = false;
    };
  }, [
    save,
    scramble,
    phase,
    pending,
    manualInput,
    inspectionInput,
    saving,
    generating,
    Math.ceil(waitRemaining / 1000),
  ]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const tick = () => {
      if (!waitUntil.current) return;
      const remaining = Math.max(0, waitUntil.current - performance.now());
      setWaitRemaining(remaining);
      if (remaining === 0) transition("ready");
    };
    const interval = setInterval(tick, 200);
    tick();
    return () => clearInterval(interval);
  }, [phase, transition]);

  useEffect(() => {
    if (!["running", "inspection", "holding"].includes(phase)) return;
    let animation = 0;
    const tick = () => {
      const now = performance.now();
      if (phaseRef.current === "running")
        setElapsed(Math.min(MAX_TIME_MS, now - solveStart.current));
      else if (inspectionStart.current !== null)
        setElapsed(now - inspectionStart.current);
      if (phaseRef.current === "holding")
        setHeld(now - holdStart.current >= holdMs);
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [phase, holdMs]);

  const finish = useCallback(
    (interrupted = false, stoppedAt = performance.now()) => {
      audio.stop();
      const rawMs =
        phaseRef.current === "running"
          ? Math.min(
              MAX_TIME_MS,
              Math.max(0, Math.floor((stoppedAt - solveStart.current) / 10) * 10),
            )
          : null;
      setPending({
        attemptId: draftId.current,
        rawMs,
        penalty: interrupted ? "DNF" : "none",
        inputMethod: "timer",
        ...(interrupted ? { interrupted: true } : {}),
        ...(inspectionDuration.current !== undefined
          ? { inspectionMs: inspectionDuration.current }
          : {}),
      });
      setElapsed(rawMs ?? 0);
      setHeld(false);
      transition("review");
    },
    [transition],
  );

  useEffect(() => {
    const interrupt = () => {
      const current = phaseRef.current;
      if (
        current === "running" ||
        current === "inspection" ||
        current === "holding"
      ) {
        touch.cancel();
        finish(true);
        Alert.alert(
          "Attempt interrupted",
          "This attempt has been marked DNF for review. Save it when you return.",
        );
      }
    };
    const listener = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        audio.stop();
        interrupt();
      }
    });
    const blur = AppState.addEventListener("blur", interrupt);
    return () => {
      listener.remove();
      blur.remove();
    };
  }, [finish, touch]);

  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (importOpen || scorecardEditing || pendingEdit || completedRoundId)
        return false;
      if (pagingLocked(phaseRef.current)) return true;
      if (page !== 1) {
        pager.current?.setPage(1);
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [importOpen, scorecardEditing, pendingEdit, completedRoundId, page]);

  const audioSelection = () => ({
    language: save?.preferences.voiceLanguage ?? "en",
    voice: save?.preferences.voice ?? "male-1",
    volume: save?.preferences.voiceVolume ?? 1,
  });
  useEffect(() => () => audio.stop(), [audio]);
  const beginSolve = () => {
    audio.stop();
    const now = performance.now();
    inspectionDuration.current =
      inspectionStart.current === null
        ? undefined
        : Math.max(0, Math.floor(now - inspectionStart.current));
    if (manualMode) {
      setInspectionInput("");
      inspectionDuration.current = undefined;
      inspectionStart.current = null;
      setManualOpen(true);
      setElapsed(0);
      setHeld(false);
      transition("ready");
    } else {
      solveStart.current = now;
      setElapsed(0);
      setHeld(false);
      transition("running");
    }
  };
  const startInspection = () => {
    inspectionStart.current = performance.now();
    inspectionDuration.current = undefined;
    if (save?.preferences.inspectionAudio) {
      setAudioError(false);
      void audio.prepare(audioSelection()).catch(() => setAudioError(true));
      audio.start(inspectionStart.current);
    }
    setElapsed(0);
    transition("inspection");
  };
  const touchPoint = (event: GestureResponderEvent) => ({
    x: event.nativeEvent.pageX,
    y: event.nativeEvent.pageY,
    at: performance.now(),
  });
  const cancelTouch = () => {
    touch.cancel();
    inspectionTap.current = false;
    if (phaseRef.current === "holding") {
      setHeld(false);
      transition(inspectionStart.current === null ? "ready" : "inspection");
    }
  };
  const touchStart = (nativeEvent: GestureResponderEvent) => {
    if (screenReader) return;
    if (phaseRef.current === "running") {
      stoppedTouch.current = true;
      touch.cancel();
      finish(false, performance.now());
      return;
    }
    if (stoppedTouch.current) return;
    if (
      !scramble ||
      generating ||
      savingRef.current ||
      draftError
    )
      return;
    const current = phaseRef.current;
    if (current === "review") {
      touch.begin(
        touchPoint(nativeEvent),
        nativeEvent.nativeEvent.touches.length,
      );
      return;
    }
    if (manualEntry) return;
    if (nativeEvent.nativeEvent.touches.length !== 1) {
      cancelTouch();
      return;
    }
    if (current === "holding" || current === "waiting") return;
    touch.begin(
      touchPoint(nativeEvent),
      nativeEvent.nativeEvent.touches.length,
    );
    if (nativeEvent.nativeEvent.touches.length !== 1) {
      cancelTouch();
      return;
    }
    if (
      current === "scramble" ||
      (manualMode &&
        (current === "inspection" ||
          (current === "ready" &&
            (!save?.preferences.inspection || !event.inspection))))
    )
      return;
    if (
      current === "ready" &&
      save?.preferences.inspection &&
      event.inspection
    ) {
      inspectionTap.current = true;
      return;
    }
    holdStart.current = performance.now();
    setHeld(holdMs === 0);
    transition("holding");
  };
  const touchMove = (event: GestureResponderEvent) => {
    if (screenReader || stoppedTouch.current) return;
    if (!touch.move(touchPoint(event), event.nativeEvent.touches.length))
      cancelTouch();
  };
  const touchEnd = (event: GestureResponderEvent) => {
    if (screenReader) return;
    if (stoppedTouch.current) {
      if (event.nativeEvent.touches.length === 0) stoppedTouch.current = false;
      touch.cancel();
      return;
    }
    if (event.nativeEvent.touches.length !== 0) {
      cancelTouch();
      return;
    }
    const point = touchPoint(event);
    const duration = touch.end(point);
    if (duration === null) {
      cancelTouch();
      return;
    }
    if (phaseRef.current === "running") {
      finish(false, point.at - duration);
      return;
    }
    if (phaseRef.current === "review") {
      void saveResult();
      return;
    }
    if (phaseRef.current === "scramble") {
      confirmPuzzle();
      return;
    }
    if (
      manualMode &&
      (phaseRef.current === "inspection" ||
        (phaseRef.current === "ready" && !inspectionTap.current))
    ) {
      beginSolve();
      return;
    }
    if (inspectionTap.current && phaseRef.current === "ready") {
      inspectionTap.current = false;
      startInspection();
      return;
    }
    if (phaseRef.current === "holding" && duration >= holdMs) beginSolve();
    else cancelTouch();
  };
  const accessibleActivate = () => {
    if (
      !scramble ||
      generating ||
      savingRef.current ||
      (draftError && phaseRef.current !== "running")
    )
      return;
    if (phaseRef.current === "review") {
      void saveResult();
      return;
    }
    if (phaseRef.current === "scramble") {
      confirmPuzzle();
      return;
    }
    if (manualEntry) return;
    if (phaseRef.current === "running") finish();
    else if (
      phaseRef.current === "ready" &&
      save?.preferences.inspection &&
      event.inspection
    )
      startInspection();
    else if (phaseRef.current === "ready" || phaseRef.current === "inspection")
      beginSolve();
  };
  const nextScramble = (requestNew = true) => {
    draftId.current = createId();
    setManualOpen(false);
    setManualInput("");
    setInspectionInput("");
    setManualError("");
    setWaitRemaining(0);
    waitUntil.current = 0;
    setScramble(null);
    setPending(null);
    inspectionStart.current = null;
    inspectionDuration.current = undefined;
    setElapsed(0);
    transition("scramble");
    if (requestNew) setGeneration((value) => value + 1);
  };
  const confirmPuzzle = () => {
    if (!save || !scramble || phaseRef.current !== "scramble") return;
    const confirmed = confirmScramble(
      { id: draftId.current, phase: "scramble", scramble },
      save.preferences,
    );
    setWaitRemaining(confirmed.waitRemainingMs ?? 0);
    waitUntil.current = performance.now() + (confirmed.waitRemainingMs ?? 0);
    transition(confirmed.phase);
  };
  const persistResult = async (result: PendingResult) => {
    if (!saveRef.current || !scramble || savingRef.current) return false;
    const next = recordResult(saveRef.current, scramble, result);
    if (!(await commit(next, false))) return false;
    const completed = next.history.rounds.find(
      (round) =>
        round.completedAt !== undefined &&
        round.attempts.some((attempt) => attempt.id === result.attemptId),
    );
    if (completed) {
      setCompletedRoundId(completed.id);
      nextScramble(false);
    } else nextScramble();
    return true;
  };
  const saveResult = async () => {
    if (!pending) return;
    try {
      await persistResult(pending);
    } catch {
      Alert.alert(
        "Could not record this attempt",
        "Your result is still here. Please try again.",
      );
    }
  };
  const dismissSummary = () => {
    setCompletedRoundId(null);
    setGeneration((value) => value + 1);
  };
  const deletePending = async () => {
    if (
      !saveRef.current ||
      !(await commit({ ...saveRef.current, draft: undefined }, false))
    )
      return false;
    nextScramble();
    return true;
  };
  const selectEvent = async (nextEvent: EventId) => {
    if (!save || savingRef.current) return;
    const apply = async () => {
      if (
        await commit(changeEvent(saveRef.current ?? save, nextEvent), false)
      ) {
        nextScramble(nextEvent === eventId);
      }
    };
    if (nextEvent === eventId) return;
    if (activeRound || pending)
      Alert.alert(
        "End this round?",
        "The unfinished round and its attempts will be discarded. Completed rounds remain saved.",
        [
          { text: "Keep round", style: "cancel" },
          {
            text: "End round",
            style: "destructive",
            onPress: () => {
              void apply();
            },
          },
        ],
      );
    else await apply();
  };
  const enterManual = async () => {
    if (savingRef.current) return;
    try {
      const result = manualResult(manualInput, "", eventId, draftId.current);
      Keyboard.dismiss();
      await persistResult(result);
    } catch (error) {
      setManualError(error instanceof Error ? error.message : "Invalid time.");
    }
  };
  const replaceHistory = async (source: string | MobileSave["history"]) => {
    if (!saveRef.current || savingRef.current)
      throw new Error("Local history is busy. Try again.");
    const next = prepareHistoryReplacement(saveRef.current, source);
    savingRef.current = true;
    setSaving(true);
    try {
      await replaceSave(next);
      updateSave(next);
      nextScramble();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const shareHistory = () => {
    if (save)
      void Share.share({
        title: "Cubing Comp Sim history",
        message: exportHistory(save),
      }).catch(() =>
        Alert.alert("Export failed", "Your history is unchanged."),
      );
  };
  const confirmImport = () => {
    if (!save) return;
    try {
      const prepared = prepareHistoryReplacement(save, importText);
      Alert.alert(
        "Replace local history?",
        `Replace this device’s history with ${prepared.history.rounds.length} imported rounds? A recovery copy is kept.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Replace",
            style: "destructive",
            onPress: () => {
              void replaceHistory(prepared.history)
                .then(() => {
                  setImportOpen(false);
                  setImportText("");
                })
                .catch(() =>
                  Alert.alert(
                    "Import failed",
                    "Your previous history is unchanged.",
                  ),
                );
            },
          },
        ],
      );
    } catch {
      Alert.alert(
        "Invalid history",
        "The entire file must be a valid Cubing Comp Sim export. Nothing was changed.",
      );
    }
  };
  const retryEngine = () => {
    if (!["scramble", "ready"].includes(phaseRef.current) || savingRef.current)
      return;
    setScramble(null);
    setEngineStatus({ phase: "loading" });
    setGenerationError(false);
    setEngineKey((value) => value + 1);
  };

  const inspectionRunning =
    phase === "inspection" ||
    (phase === "holding" && inspectionStart.current !== null);
  const inspectionLabel = inspectionRunning
    ? inspectionPenalty(elapsed)
    : "none";
  const timerLabel =
    phase === "scramble"
      ? "Confirm scramble"
      : phase === "ready"
        ? "Ready"
        : phase === "running"
          ? "Tap to stop"
          : phase === "holding"
            ? held
              ? "Release to start"
              : "Keep holding"
            : phase === "inspection"
              ? holdMs === 0
                ? "Tap and release to solve"
                : "Hold, then release to solve"
              : phase === "waiting"
                ? "Waiting for your turn"
                : phase === "review"
                  ? "Review your solve"
                  : save?.preferences.inspection && event.inspection
                    ? "Tap to begin inspection"
                    : holdMs === 0
                      ? "Tap and release to solve"
                      : "Hold, then release to solve";

  const reviewRound = useMemo(() => {
    if (!save || !scramble || !pending) return undefined;
    try {
      return recordResult(save, scramble, pending).history.rounds.find(
        (round) =>
          round.attempts.some((attempt) => attempt.id === pending.attemptId),
      );
    } catch {
      return undefined;
    }
  }, [save, scramble, pending]);
  const timerText =
    phase === "waiting"
      ? `${Math.ceil(waitRemaining / 1000)}`
      : inspectionRunning
        ? inspectionLabel === "none"
          ? String(Math.max(0, 15 - Math.floor(elapsed / 1000)))
          : inspectionLabel
        : pending
          ? formatAttempt({
              ...pending,
              inspectionPenalty: pendingInspection(pending, eventId),
            })
          : phase === "ready" && !manualEntry
            ? "Ready"
            : phase === "running" && save?.preferences.timerDisplay === "solve"
              ? "Solve"
              : phase === "running" &&
                  save?.preferences.timerDisplay === "seconds"
                ? String(Math.floor(elapsed / 1000))
                : formatTime(elapsed);
  const completedRound = save?.history.rounds.find(
    (round) => round.id === completedRoundId,
  );
  const reviewAttempt = reviewRound?.attempts.find(
    (attempt) => attempt.id === pending?.attemptId,
  );
  const changePage = (index: number) => {
    if (index !== 1 && pagingLocked(phaseRef.current)) {
      pager.current?.setPageWithoutAnimation(1);
      return;
    }
    if (index !== 1) {
      Keyboard.dismiss();
      cancelTouch();
    }
    setPage(index);
  };
  return (
    <MobileThemeProvider
      preferences={save?.preferences ?? { eventId: "333", inspection: true }}
    >
      <PagerInteractionContext.Provider value={setPagerInteraction}>
        <SafeAreaView style={styles.safe}>
          <StatusBar
            hidden={phase === "running"}
            barStyle={theme.dark ? "light-content" : "dark-content"}
          />
          <TnoodleEngineHost
            key={engineKey}
            service={engine}
            onStatus={setEngineStatus}
          />
          {!save ? (
            <View style={styles.centered}>
              {loadError ? (
                <>
                  <Text style={styles.body}>History could not be opened.</Text>
                  <Button label="Try again" onPress={openLocalSave} />
                </>
              ) : (
                <ThinkingDots />
              )}
            </View>
          ) : (
            <>
              <PagerView
                ref={pager}
                style={styles.pager}
                initialPage={1}
                scrollEnabled={!pagingLocked(phase, interacting)}
                overdrag={false}
                onPageSelected={(event) =>
                  changePage(event.nativeEvent.position)
                }
              >
                <View key="scorecard" collapsable={false} style={styles.page}>
                  <Scorecard
                    drawScramble={drawScramble}
                    save={save}
                    onSave={commit}
                    disabled={saving || accountBusy}
                    onSelectEvent={(id) => {
                      void selectEvent(id);
                    }}
                    onEditingChange={setScorecardEditing}
                    review={
                      reviewRound && pending
                        ? {
                            round: reviewRound,
                            attemptId: pending.attemptId ?? draftId.current,
                            interrupted: pending.interrupted,
                            svg: scramble?.svg,
                            onDelete: deletePending,
                            onPenalty: (penalty) => {
                              setPending(
                                selectPendingPenalty(pending, penalty, eventId),
                              );
                            },
                            onEdit: (patch) => {
                              setPending(
                                validatePendingResult(
                                  { ...pending, ...patch },
                                  eventId,
                                ),
                              );
                            },
                          }
                        : undefined
                    }
                  />
                </View>
                <View key="practice" collapsable={false} style={styles.page}>
                  <KeyboardAvoidingView
                    style={styles.page}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                  >
                    <View
                      style={styles.practice}
                      accessible={!manualEntry}
                      accessibilityRole="button"
                      accessibilityLabel={
                        phase === "review" ? "Continue" : timerLabel
                      }
                      accessibilityActions={[
                        { name: "increment", label: "Settings" },
                        { name: "decrement", label: "Scorecard" },
                      ]}
                      onAccessibilityAction={(e) => {
                        if (!pagingLocked(phaseRef.current))
                          pager.current?.setPage(
                            e.nativeEvent.actionName === "increment" ? 2 : 0,
                          );
                      }}
                      onAccessibilityTap={accessibleActivate}
                      onTouchStart={touchStart}
                      onTouchMove={touchMove}
                      onTouchEnd={touchEnd}
                      onTouchCancel={() => { stoppedTouch.current = false; cancelTouch(); }}
                    >
                      {phase === "scramble" ? (
                        <View style={styles.scramblePhase}>
                          {generating || !scramble ? (
                            <ThinkingDots />
                          ) : (
                            <>
                              <Text
                                adjustsFontSizeToFit
                                minimumFontScale={0.65}
                                numberOfLines={height > width ? 10 : 5}
                                style={[
                                  styles.notation,
                                  {
                                    fontSize:
                                      save.preferences.scrambleFontSize ?? 24,
                                    lineHeight:
                                      (save.preferences.scrambleFontSize ??
                                        24) * 1.35,
                                    maxHeight: "48%",
                                  },
                                ]}
                              >
                                {scramble.notation}
                              </Text>
                              {save.preferences.showScrambleDrawing && (
                                <View
                                  style={{
                                    flex: 1,
                                    width: "100%",
                                    paddingTop: 24,
                                    paddingBottom: 20,
                                  }}
                                >
                                  <SvgXml
                                    xml={scramble.svg}
                                    width="100%"
                                    height="100%"
                                  />
                                </View>
                              )}
                              <View style={{ marginTop: "auto", paddingTop: 16 }}
                                onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                                <Button label="Scramble is good" disabled={draftError || saving} onPress={confirmPuzzle} />
                              </View>
                            </>
                          )}
                        </View>
                      ) : (
                        <>
                          <View
                            pointerEvents={manualEntry || phase === "review" ? "auto" : "none"}
                            style={styles.timeCenter}
                          >
                            {manualEntry ? (
                              <TextInput
                                accessibilityLabel="Solve time"
                                value={manualInput}
                                onChangeText={setManualInput}
                                editable={
                                  Boolean(scramble) && !generating && !saving
                                }
                                placeholder="0.00"
                                placeholderTextColor={theme.muted}
                                keyboardType="decimal-pad"
                                returnKeyType="done"
                                onSubmitEditing={() => {
                                  void enterManual();
                                }}
                                style={[
                                  styles.timer,
                                  { fontSize: width > 600 ? 112 : 72 },
                                ]}
                              />
                            ) : phase === "ready" ? (
                              <View>
                                <Button label="Ready" disabled={draftError || saving} onPress={() => { if (screenReader) accessibleActivate(); }} />
                              </View>
                            ) : (
                              <Text
                                adjustsFontSizeToFit
                                numberOfLines={1}
                                style={[
                                  styles.timer,
                                  { fontSize: width > 600 ? 112 : 80 },
                                  phase === "holding" && {
                                    color: held ? theme.success : theme.danger,
                                  },
                                ]}
                              >
                                {timerText}
                              </Text>
                            )}
                            {phase === "review" && (
                              <View style={{ marginTop: 22 }} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
                                <Button label={saving ? "…" : "Continue"} disabled={saving} onPress={() => { void saveResult(); }} />
                              </View>
                            )}
                            {phase === "waiting" && (
                              <Text style={styles.continue}>Wait</Text>
                            )}
                          </View>
                          {manualEntry && (
                            <View
                              style={styles.bottomAction}
                              onTouchStart={(e) => e.stopPropagation()}
                              onTouchEnd={(e) => e.stopPropagation()}
                            >
                              <Button
                                label="Continue"
                                disabled={
                                  !manualInput.trim() || saving || generating
                                }
                                onPress={() => {
                                  void enterManual();
                                }}
                              />
                            </View>
                          )}
                        </>
                      )}
                    </View>
                    {phase === "review" && pending && (
                      <View style={styles.reviewActions}>
                        {(["+2", "DNF"] as const).map((value) => (
                          <Pressable
                            key={value}
                            accessibilityRole="button"
                            accessibilityState={{
                              selected:
                                selectedPendingPenalty(pending, eventId) ===
                                value,
                            }}
                            disabled={saving}
                            onPress={() => {
                              try {
                                setPending(
                                  selectPendingPenalty(
                                    pending,
                                    selectedPendingPenalty(pending, eventId) ===
                                      value
                                      ? "none"
                                      : value,
                                    eventId,
                                  ),
                                );
                              } catch (error) {
                                Alert.alert(
                                  "Penalty",
                                  error instanceof Error
                                    ? error.message
                                    : "Could not change penalty.",
                                );
                              }
                            }}
                            style={[
                              styles.reviewAction,
                              { borderColor: theme.accent },
                            ]}
                          >
                            <Text
                              style={{
                                color:
                                  selectedPendingPenalty(pending, eventId) ===
                                  value
                                    ? theme.accent
                                    : theme.text,
                                fontSize: 18,
                              }}
                            >
                              {value}
                            </Text>
                          </Pressable>
                        ))}
                        <Pressable
                          accessibilityRole="button"
                          disabled={saving}
                          onPress={() => setPendingEdit(true)}
                          style={[
                            styles.reviewAction,
                            { borderColor: theme.accent },
                          ]}
                        >
                          <Text style={{ color: theme.text, fontSize: 18 }}>
                            Edit
                          </Text>
                        </Pressable>
                        <Button label="Delete" disabled={saving} onPress={() => {
                          Alert.alert("Delete solve?", "This solve will not be saved.", [
                            { text: "Keep solve", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => { void deletePending(); } },
                          ]);
                        }} />
                      </View>
                    )}
                    {(generationError || engineStatus.phase === "error") && (
                      <View style={styles.notice}>
                        <Button label="Retry scramble" onPress={retryEngine} />
                      </View>
                    )}
                    {draftError && (
                      <View style={styles.notice}>
                        <Button
                          label="Retry saving"
                          onPress={() => {
                            const draft = captureDraft();
                            if (draft && saveRef.current)
                              void storeDraft(draft, saveRef.current.history)
                                .then((written) => setDraftError(!written))
                                .catch(() => setDraftError(true));
                          }}
                        />
                      </View>
                    )}
                    {!!manualError && (
                      <Text accessibilityRole="alert" style={styles.error}>
                        {manualError}
                      </Text>
                    )}
                    {audioError && (
                      <Pressable
                        onPress={() => {
                          setAudioError(false);
                          Alert.alert(
                            "Inspection voice unavailable",
                            "Check voice settings and try Test voice.",
                          );
                        }}
                      >
                        <Text style={styles.error}>Voice unavailable</Text>
                      </Pressable>
                    )}
                  </KeyboardAvoidingView>
                </View>
                <View key="settings" collapsable={false} style={styles.page}>
                  <ScrollView
                    scrollEnabled={!interacting}
                    contentContainerStyle={styles.settings}
                    keyboardShouldPersistTaps="handled"
                    automaticallyAdjustKeyboardInsets
                  >
                    <Text style={{ color: theme.text, fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 20 }}>Settings</Text>
                    <PracticeSettings
                      preferences={save.preferences}
                      disabled={saving || accountBusy || activeClock}
                      onChange={(preferences) =>
                        commit({ ...saveRef.current!, preferences })
                      }
                    />
                    <AudioSettings
                      preferences={save.preferences}
                      disabled={saving || accountBusy || activeClock}
                      onChange={(preferences) =>
                        commit({ ...saveRef.current!, preferences })
                      }
                      onPreview={() => {
                        setAudioError(false);
                        void audio.preview(audioSelection()).catch(() => {
                          setAudioError(true);
                          Alert.alert(
                            "Voice unavailable",
                            "The recording could not be played.",
                          );
                        });
                      }}
                    />
                    <AccountPanel
                      getSnapshot={() => saveRef.current!.history}
                      disabled={saving || generating}
                      onBusyChange={setAccountBusy}
                      replaceSnapshot={async (snapshot, expectedLocal) => {
                        if (
                          JSON.stringify(saveRef.current?.history) !==
                          JSON.stringify(expectedLocal)
                        )
                          throw new Error(
                            "Local history changed. Start the download again.",
                          );
                        await replaceHistory(snapshot);
                      }}
                    />
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Local history</Text>
                      <Button
                        label="Export Solve JSON"
                        onPress={shareHistory}
                        disabled={saving || accountBusy}
                      />
                      <Button
                        label="Import Solve JSON"
                        onPress={() => setImportOpen(true)}
                        disabled={saving || accountBusy}
                      />
                    </View>
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>About</Text>
                      <Text style={styles.body}>Built by Brandon True.</Text>
                      <Button
                        label="Privacy policy"
                        onPress={() => {
                          void Linking.openURL(
                            "https://cubingcompsim.com/privacy/",
                          );
                        }}
                      />
                      <Button
                        label="Terms of service"
                        onPress={() => {
                          void Linking.openURL(
                            "https://cubingcompsim.com/terms/",
                          );
                        }}
                      />
                      <Button
                        label="Source code & licenses"
                        onPress={() => {
                          void Linking.openURL(
                            "https://github.com/Brandonius813/cubing-comp-sim",
                          );
                        }}
                      />
                    </View>
                  </ScrollView>
                </View>
              </PagerView>
            </>
          )}
          <Modal
            visible={pendingEdit && Boolean(reviewAttempt)}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setPendingEdit(false)}
          >
            <SafeAreaView style={styles.safe}>
              {reviewAttempt && pending && (
                <TimeEditor
                  key={reviewAttempt.id}
                  attempt={reviewAttempt}
                  initialSvg={scramble?.svg}
                  drawScramble={drawScramble}
                  onClose={() => setPendingEdit(false)}
                  onChange={async (patch) => {
                    setPending(
                      validatePendingResult({ ...pending, ...patch }, eventId),
                    );
                    return true;
                  }}
                  onDelete={deletePending}
                />
              )}
            </SafeAreaView>
          </Modal>
          <Modal
            visible={Boolean(completedRound)}
            transparent
            animationType="fade"
            onRequestClose={dismissSummary}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(0,0,0,.45)",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <Pressable
                accessibilityLabel="Dismiss round result"
                onPress={dismissSummary}
                style={StyleSheet.absoluteFill}
              />
              <View
                style={{
                  maxHeight: "94%",
                  width: "100%",
                  maxWidth: 560,
                  alignSelf: "center",
                  backgroundColor: theme.background,
                  padding: 16,
                }}
                onTouchStart={(e) => {
                  summaryTouchY.current = e.nativeEvent.pageY;
                }}
                onTouchEnd={(e) => {
                  if (e.nativeEvent.pageY - summaryTouchY.current > 90)
                    dismissSummary();
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 20 }}>
                    Round complete
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close round result"
                    onPress={dismissSummary}
                    style={{ padding: 10 }}
                  >
                    <Text style={{ color: theme.text, fontSize: 26 }}>×</Text>
                  </Pressable>
                </View>
                <ScrollView>
                  {completedRound && (
                    <RoundCard
                      round={completedRound}
                      eventId={completedRound.eventId}
                      index={
                        save!.history.rounds
                          .filter(
                            (round) => round.eventId === completedRound.eventId,
                          )
                          .findIndex(
                            (round) => round.id === completedRound.id,
                          ) + 1
                      }
                    />
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
          <Modal
            visible={importOpen}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => setImportOpen(false)}
          >
            <SafeAreaView style={styles.safe}>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.settings}
              >
                <Text style={styles.sectionTitle}>Import Solve JSON</Text>
                <TextInput
                  accessibilityLabel="History JSON"
                  multiline
                  value={importText}
                  onChangeText={setImportText}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                  editable={!saving}
                />
                <Button
                  label="Import"
                  disabled={saving}
                  onPress={confirmImport}
                />
                <Button
                  label="Cancel"
                  disabled={saving}
                  onPress={() => setImportOpen(false)}
                />
              </ScrollView>
            </SafeAreaView>
          </Modal>
        </SafeAreaView>
      </PagerInteractionContext.Provider>
    </MobileThemeProvider>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <MobileApp />
    </SafeAreaProvider>
  );
}
const makeStyles = (theme: ReturnType<typeof resolveMobileTheme>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: theme.background },
    pager: { flex: 1 },
    page: { flex: 1, backgroundColor: theme.background },
    practice: { flex: 1, position: "relative" },
    scramblePhase: {
      flex: 1,
      paddingTop: 28,
      paddingHorizontal: 22,
      paddingBottom: 24,
      alignItems: "center",
    },
    reviewActions: {
      position: "absolute",
      top: "23%",
      left: 20,
      right: 20,
      flexDirection: "row",
      justifyContent: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    reviewAction: {
      padding: 12,
      borderRadius: 10,
      minWidth: 54,
      borderWidth: 1,
      alignItems: "center",
    },
    scramble: {
      position: "absolute",
      top: 16,
      left: 18,
      right: 18,
      alignItems: "center",
    },
    notation: {
      color: theme.text,
      fontFamily: theme.fontFamily,
      textAlign: "center",
      lineHeight: 32,
      fontWeight: "600",
    },
    timeCenter: {
      position: "absolute",
      left: 20,
      right: 20,
      top: "42%",
      minHeight: 115,
      alignItems: "center",
      justifyContent: "center",
    },
    timer: {
      width: "100%",
      color: theme.text,
      fontFamily: theme.numberFontFamily,
      textAlign: "center",
      fontVariant: ["tabular-nums"],
      padding: 0,
      fontWeight: "400",
    },
    continue: {
      fontSize: 16,
      color: theme.muted,
      fontFamily: theme.fontFamily,
      paddingTop: 12,
    },
    bottomAction: { position: "absolute", top: "66%", alignSelf: "center" },
    drawing: { position: "absolute", bottom: 16, left: "20%", right: "20%" },
    settings: {
      padding: 22,
      paddingBottom: 40,
      gap: 30,
      width: "100%",
      maxWidth: 720,
      alignSelf: "center",
    },
    section: { gap: 4 },
    sectionTitle: {
      color: theme.text,
      fontFamily: theme.fontFamily,
      fontSize: 20,
      fontWeight: "600",
      marginBottom: 10,
    },
    body: {
      color: theme.muted,
      fontFamily: theme.fontFamily,
      fontSize: 16,
      lineHeight: 24,
    },
    centered: { flex: 1, justifyContent: "center", alignItems: "center" },
    notice: { position: "absolute", bottom: 18, alignSelf: "center" },
    error: { color: theme.danger, textAlign: "center", padding: 12 },
    input: {
      color: theme.text,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      fontSize: 16,
      minHeight: 220,
    },
  });
