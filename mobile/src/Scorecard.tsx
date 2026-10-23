import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";
import { EVENTS, getEvent } from "../../src/core/events";
import { possibleResults, scoreRound } from "../../src/core/scoring";
import {
  formatAttempt,
  formatTime,
  selectedPenalty,
} from "../../src/core/timing";
import type {
  Attempt,
  EventId,
  Penalty,
  Round,
  Score,
} from "../../src/core/types";
import {
  deleteHistoryAttempt,
  deleteHistoryRound,
  updateHistoryAttempt,
} from "./history";
import type { MobileSave } from "./practice";
import { EVENT_ICONS } from "./event-icons";
import { useMobileTheme } from "./ui";
import { TimeEditor, type DrawScramble, type ResultPatch } from "./TimeEditor";

const scoreText = (score: Score | null) =>
  !score || score.status === "incomplete"
    ? "—"
    : score.status === "DNF"
      ? "DNF"
      : formatTime(score.valueMs);
const formatLabel = (format: Round["format"]) =>
  ({ ao5: "Ao5", mo3: "Mo3", bo3: "Best of 3", bo5: "Best of 5" })[format];
export function EventIcon({
  eventId,
  size = 24,
}: {
  eventId: EventId;
  size?: number;
}) {
  const theme = useMobileTheme();
  return (
    <SvgXml
      xml={EVENT_ICONS[eventId].replace("<svg ", `<svg fill="${theme.text}" `)}
      width={size}
      height={size}
    />
  );
}
function Action({
  title,
  onPress,
  disabled = false,
  danger = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.action, disabled && { opacity: 0.35 }]}
    >
      <Text
        style={{
          color: danger ? theme.danger : theme.text,
          fontFamily: theme.fontFamily,
          fontSize: 16,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function RoundCard({
  round,
  eventId,
  index,
  onEdit,
  onPenalty,
  disabled = false,
}: {
  round: Round | null;
  eventId: EventId;
  index: number;
  onEdit?: (attempt: Attempt) => void;
  onPenalty?: (attempt: Attempt, penalty: Penalty) => void;
  disabled?: boolean;
}) {
  const theme = useMobileTheme();
  const definition = getEvent(round?.eventId ?? eventId);
  const score = round ? scoreRound(round) : null;
  const beforeLast =
    round?.attempts.length === definition.attemptCount
      ? { ...round, attempts: round.attempts.slice(0, -1) }
      : round;
  const possible =
    beforeLast?.attempts.length === definition.attemptCount - 1
      ? possibleResults(beforeLast)
      : null;
  const text = { color: theme.text, fontFamily: theme.fontFamily };
  const muted = { color: theme.muted, fontFamily: theme.fontFamily };
  const number = {
    color: theme.text,
    fontFamily: theme.numberFontFamily,
    fontVariant: ["tabular-nums"] as "tabular-nums"[],
  };
  return (
    <View style={[styles.scorecard, { borderColor: theme.muted }]}>
      <View style={styles.fields}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.fieldLabel, muted]}>Event</Text>
          <Text style={[styles.fieldValue, text]}>{definition.name}</Text>
        </View>
        <View>
          <Text style={[styles.fieldLabel, muted]}>Round</Text>
          <Text style={[styles.fieldValue, number]}>
            {String(index).padStart(2, "0")}
          </Text>
        </View>
      </View>
      <Text style={[styles.fieldLabel, muted, { marginBottom: 8 }]}>
        Result
      </Text>
      {Array.from({ length: definition.attemptCount }, (_, i) => {
        const attempt = round?.attempts[i];
        return (
          <View key={i} style={styles.solveRow}>
            <Text style={[styles.index, muted]}>{i + 1}</Text>
            <Pressable
              style={[styles.timeBox, { borderColor: theme.border }]}
              disabled={!attempt || disabled || !onEdit}
              accessibilityRole="button"
              accessibilityLabel={
                attempt
                  ? `Edit solve ${i + 1}: ${formatAttempt(attempt)}`
                  : `Solve ${i + 1}, empty`
              }
              onPress={() => attempt && onEdit?.(attempt)}
            >
              <Text
                adjustsFontSizeToFit
                numberOfLines={1}
                style={[
                  styles.result,
                  number,
                  score?.discardedIndices.includes(i) && { color: theme.muted },
                ]}
              >
                {attempt ? (score?.discardedIndices.includes(i) ? `(${formatAttempt(attempt)})` : formatAttempt(attempt)) : "—"}
              </Text>
            </Pressable>
            {onPenalty && (
              <View style={styles.penalties}>
                {(["+2", "DNF"] as const).map((value) => {
                  const selected =
                    attempt && selectedPenalty(attempt) === value;
                  const next = selected ? "none" : value;
                  const unavailable =
                    !attempt ||
                    disabled ||
                    (attempt.rawMs === null && next !== "DNF");
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      accessibilityLabel={`${value} for solve ${i + 1}`}
                      accessibilityState={{
                        selected: Boolean(selected),
                        disabled: unavailable,
                      }}
                      disabled={unavailable}
                      onPress={() => attempt && onPenalty(attempt, next)}
                      style={[
                        styles.penalty,
                        { opacity: !attempt ? 0 : unavailable ? 0.3 : 1 },
                      ]}
                    >
                      <Text
                        style={{
                          color: selected ? theme.accent : theme.muted,
                          fontWeight: selected ? "700" : "400",
                          fontSize: 13,
                        }}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
      <View style={[styles.average, { borderBottomColor: theme.border }]}>
        <Text style={[styles.fieldValue, muted]}>
          {formatLabel(definition.format)}
        </Text>
        <Text style={[styles.averageValue, number]}>{scoreText(score)}</Text>
      </View>
      <View style={styles.bounds}>
        <Text style={{ ...muted, color: theme.success }}>Best possible</Text>
        <Text style={{ ...number, color: theme.success }}>
          {scoreText(possible?.best ?? null)}
        </Text>
      </View>
      <View style={styles.bounds}>
        <Text style={{ ...muted, color: theme.danger }}>Worst possible</Text>
        <Text style={{ ...number, color: theme.danger }}>
          {scoreText(possible?.worst ?? null)}
        </Text>
      </View>
      {round?.goalMs !== undefined && (
        <View style={styles.bounds}>
          <Text style={muted}>Goal</Text>
          <Text style={number}>{formatTime(round.goalMs)}</Text>
        </View>
      )}
    </View>
  );
}
export interface ScorecardProps {
  save: MobileSave;
  onSave: (next: MobileSave) => Promise<boolean>;
  disabled?: boolean;
  onSelectEvent?: (eventId: EventId) => void;
  onEditingChange?: (open: boolean) => void;
  drawScramble?: DrawScramble;
  review?: {
    round: Round;
    attemptId: string;
    onPenalty: (penalty: Penalty) => void;
    onEdit?: (patch: ResultPatch) => void;
    onDelete?: () => Promise<boolean>;
    interrupted?: boolean;
    svg?: string;
  };
}
export function Scorecard({
  save,
  onSave,
  disabled = false,
  onSelectEvent,
  onEditingChange,
  review,
  drawScramble,
}: ScorecardProps) {
  const theme = useMobileTheme();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [edit, setEdit] = useState<{ round: Round; attempt: Attempt } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    onEditingChange?.(edit !== null || historyOpen || eventsOpen);
  }, [edit !== null, historyOpen, eventsOpen, onEditingChange]);
  useEffect(() => () => onEditingChange?.(false), [onEditingChange]);
  const eventId = save.preferences.eventId;
  const event = getEvent(eventId);
  const rounds = useMemo(
    () => save.history.rounds.filter((round) => round.eventId === eventId),
    [save.history.rounds, eventId],
  );
  const current =
    review?.round.eventId === eventId
      ? review.round
      : (rounds.find((round) => round.id === save.history.activeRoundId) ??
        null);
  const roundNumber = current
    ? Math.max(
        1,
        rounds.findIndex((round) => round.id === current.id) + 1 ||
          rounds.length + 1,
      )
    : rounds.length + 1;
  const text = { color: theme.text, fontFamily: theme.fontFamily };
  const muted = { color: theme.muted, fontFamily: theme.fontFamily };
  const write = async (next: () => MobileSave) => {
    if (disabled || busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const ok = await onSave(next());
      if (!ok) setError("Change was not saved.");
      return ok;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const removeRound = (round: Round) =>
    Alert.alert("Delete round?", "This removes all solves in this round.", [
      { text: "Keep round", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void write(() => deleteHistoryRound(save, round.id));
        },
      },
    ]);
  const quick = (attempt: Attempt, value: Penalty) => {
    if (attempt.id === review?.attemptId) {
      try {
        review.onPenalty(value);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not change penalty.",
        );
      }
      return;
    }
    void write(() =>
      updateHistoryAttempt(save, attempt.roundId, attempt.id, {
        penalty: value,
        inspectionPenalty: "none",
      }),
    );
  };
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.selectorWrap}>
        <Pressable
          disabled={disabled || busy}
          accessibilityRole="button"
          accessibilityState={{ expanded: eventsOpen }}
          accessibilityLabel={`Choose event. ${event.name}`}
          onPress={() => setEventsOpen((value) => !value)}
          style={styles.selector}
        >
          <EventIcon eventId={eventId} />
          <Text style={[styles.eventName, text]}>{event.name}</Text>
          <Text style={muted}>{eventsOpen ? "⌃" : "⌄"}</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <RoundCard
          round={current}
          eventId={eventId}
          index={roundNumber}
          disabled={disabled || busy}
          onEdit={(attempt) => current && setEdit({ round: current, attempt })}
          onPenalty={quick}
        />
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {error}
          </Text>
        )}
        <Action title="All Stats ↑" onPress={() => setHistoryOpen(true)} />
      </ScrollView>
      {eventsOpen && (
        <>
          <Pressable
            accessibilityLabel="Close event menu"
            onPress={() => setEventsOpen(false)}
            style={[StyleSheet.absoluteFill, { top: 72 }]}
          />
          <View
            style={[
              styles.eventMenu,
              { backgroundColor: theme.field, borderColor: theme.muted },
            ]}
          >
            <ScrollView nestedScrollEnabled style={{ maxHeight: 340 }}>
              {EVENTS.map((item) => (
                <Pressable
                  key={item.id}
                  disabled={disabled || busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: eventId === item.id }}
                  onPress={() => {
                    setEventsOpen(false);
                    if (item.id !== eventId) onSelectEvent?.(item.id);
                  }}
                  style={[
                    styles.eventOption,
                    {
                      backgroundColor:
                        item.id === eventId ? theme.border : "transparent",
                    },
                  ]}
                >
                  <EventIcon eventId={item.id} size={20} />
                  <Text style={[text, { fontSize: 17 }]}>{item.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </>
      )}
      <Modal
        visible={historyOpen || edit !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          if (!busy) {
            if (edit) setEdit(null);
            else setHistoryOpen(false);
          }
        }}
      >
        <SafeAreaView
          style={[styles.container, { backgroundColor: theme.background }]}
        >
          {edit ? (
            <TimeEditor
              key={edit.attempt.id}
              attempt={edit.attempt}
              drawScramble={drawScramble}
              initialSvg={
                edit.attempt.id === review?.attemptId ? review.svg : undefined
              }
              onClose={() => setEdit(null)}
              onChange={async (patch) => {
                if (edit.attempt.id === review?.attemptId && review.onEdit) {
                  review.onEdit(patch);
                  return true;
                }
                return write(() =>
                  updateHistoryAttempt(
                    save,
                    edit.round.id,
                    edit.attempt.id,
                    patch,
                  ),
                );
              }}
              onDelete={async () => {
                if (edit.attempt.id === review?.attemptId && review.onDelete)
                  return review.onDelete();
                return write(() =>
                  deleteHistoryAttempt(save, edit.round.id, edit.attempt.id),
                );
              }}
            />
          ) : (
            <>
              <View style={styles.sheetHeading}>
                <Text style={[styles.sheetTitle, text]}>
                  All Stats
                </Text>
                <Action title="Done" onPress={() => setHistoryOpen(false)} />
              </View>
              <FlatList
                data={save.history.rounds.slice().reverse()}
                keyExtractor={(round) => round.id}
                contentContainerStyle={styles.content}
                initialNumToRender={12}
                ListEmptyComponent={<Text style={muted}>No solves yet.</Text>}
                renderItem={({ item, index }) => (
                  <View
                    style={[styles.historyRound, { borderColor: theme.border }]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <View>
                        <Text
                          style={[text, { fontSize: 16, fontWeight: "600" }]}
                        >
                          {getEvent(item.eventId).name} · Round {save.history.rounds.length - index}
                        </Text>
                        <Text style={[muted, { fontSize: 12, marginTop: 4 }]}>
                          {new Date(item.createdAt).toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[muted, { fontSize: 12 }]}>
                          {formatLabel(item.format)}
                        </Text>
                        <Text
                          style={[
                            text,
                            {
                              fontFamily: theme.numberFontFamily,
                              fontSize: 21,
                            },
                          ]}
                        >
                          {scoreText(scoreRound(item))}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 6,
                        marginTop: 10,
                      }}
                    >
                      {item.attempts.map((attempt) => (
                        <Pressable
                          key={attempt.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Edit solve ${attempt.index + 1}: ${formatAttempt(attempt)}`}
                          disabled={disabled || busy}
                          onPress={() => setEdit({ round: item, attempt })}
                          style={{
                            padding: 8,
                            minHeight: 44,
                            borderWidth: 1,
                            borderColor: theme.border,
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={[
                              text,
                              {
                                fontFamily: theme.numberFontFamily,
                                fontSize: 14,
                              },
                            ]}
                          >
                            {formatAttempt(attempt)}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Action
                      title="Delete round"
                      danger
                      disabled={disabled || busy}
                      onPress={() => removeRound(item)}
                    />
                  </View>
                )}
              />
            </>
          )}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
  },
  selectorWrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
  },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 52,
  },
  eventName: { fontSize: 23, flex: 1 },
  eventMenu: {
    position: "absolute",
    top: 68,
    left: 18,
    right: 18,
    borderWidth: 1,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 12,
    overflow: "hidden",
    zIndex: 10,
  },
  eventOption: {
    minHeight: 50,
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  scorecard: { width: "100%", borderWidth: 1.5, padding: 16 },
  fields: { flexDirection: "row", gap: 20, marginBottom: 18 },
  fieldLabel: { fontSize: 13, marginBottom: 4 },
  fieldValue: { fontSize: 18 },
  solveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  index: { width: 14, fontSize: 15 },
  timeBox: {
    minHeight: 48,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  result: { fontSize: 25 },
  penalties: { flexDirection: "row" },
  penalty: {
    minWidth: 40,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  average: {
    minHeight: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  averageValue: { fontSize: 26 },
  bounds: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  action: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  sheetHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 10,
  },
  sheetTitle: { fontSize: 22, fontWeight: "500" },
  historyRound: { padding: 12, borderWidth: 1, marginBottom: 14 },
});
