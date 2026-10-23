import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { EVENTS, getEvent } from '../../src/core/events';
import { possibleResults, scoreRound } from '../../src/core/scoring';
import { formatAttempt, formatTime, parseTimeInput, selectedPenalty } from '../../src/core/timing';
import type { Attempt, EventId, InspectionPenalty, Penalty, Round, Score } from '../../src/core/types';
import { updateHistoryAttempt } from './history';
import type { MobileSave } from './practice';
import { EVENT_ICONS } from './event-icons';
import { useMobileTheme } from './ui';

const scoreText = (score: Score | null) => !score || score.status === 'incomplete' ? '—' : score.status === 'DNF' ? 'DNF' : formatTime(score.valueMs);
const formatLabel = (format: Round['format']) => ({ ao5: 'Ao5', mo3: 'Mo3', bo3: 'Best of 3', bo5: 'Best of 5' })[format];
export function EventIcon({ eventId, size = 24 }: { eventId: EventId; size?: number }) {
  const theme = useMobileTheme();
  return <SvgXml xml={EVENT_ICONS[eventId].replace('<svg ', `<svg fill="${theme.text}" `)} width={size} height={size} />;
}
function Action({ title, onPress, disabled = false, selected = false }: { title: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  const theme = useMobileTheme();
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled, selected }} style={[styles.action, disabled && { opacity: .35 }]}><Text style={{ color: selected ? theme.accent : theme.text, fontFamily: theme.fontFamily, fontSize: 16, fontWeight: selected ? '700' : '400' }}>{title}</Text></Pressable>;
}
export interface ScorecardProps {
  save: MobileSave;
  onSave: (next: MobileSave) => Promise<boolean>;
  disabled?: boolean;
  onSelectEvent?: (eventId: EventId) => void;
  onExport?: () => void;
  onEditingChange?: (open: boolean) => void;
  review?: { round: Round; attemptId: string; onPenalty: (penalty: Penalty) => void; onEdit?: (patch: Pick<Attempt, 'rawMs' | 'penalty' | 'inspectionPenalty'>) => void; interrupted?: boolean };
}

/** The main view is the current paper scorecard. Full history lives in its own sheet. */
export function Scorecard({ save, onSave, disabled = false, onSelectEvent, onEditingChange, review }: ScorecardProps) {
  const theme = useMobileTheme();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [edit, setEdit] = useState<{ round: Round; attempt: Attempt } | null>(null);
  const [input, setInput] = useState('');
  const [penalty, setPenalty] = useState<Penalty>('none');
  const [inspection, setInspection] = useState<InspectionPenalty>('none');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => { onEditingChange?.(edit !== null || historyOpen || eventsOpen); }, [edit !== null, historyOpen, eventsOpen, onEditingChange]);
  useEffect(() => () => { onEditingChange?.(false); }, [onEditingChange]);
  const eventId = save.preferences.eventId;
  const event = getEvent(eventId);
  const rounds = useMemo(() => save.history.rounds.filter(round => round.eventId === eventId), [save.history.rounds, eventId]);
  const current = review?.round.eventId === eventId ? review.round : rounds.find(round => round.id === save.history.activeRoundId) ?? null;
  const roundNumber = current ? Math.max(1, rounds.findIndex(round => round.id === current.id) + 1 || rounds.length + 1) : rounds.length + 1;
  const text = { color: theme.text, fontFamily: theme.fontFamily };
  const muted = { color: theme.muted, fontFamily: theme.fontFamily };
  const number = { color: theme.text, fontFamily: theme.numberFontFamily, fontVariant: ['tabular-nums'] as ('tabular-nums')[] };
  const openEdit = (round: Round, attempt: Attempt) => {
    if (attempt.id === review?.attemptId && !review.onEdit) return;
    setEdit({ round, attempt }); setInput(attempt.rawMs === null ? '' : (attempt.rawMs / 1000).toFixed(3));
    setPenalty(attempt.penalty); setInspection(attempt.inspectionPenalty); setError('');
  };
  const apply = async () => {
    if (!edit || busyRef.current || disabled) return;
    const parsed = input.trim() ? parseTimeInput(input) : null;
    if (input.trim() && (!parsed || parsed.rawMs === null || parsed.penalty !== 'none')) { setError('Enter a time without a penalty suffix.'); return; }
    try {
      if (edit.attempt.id === review?.attemptId && review.onEdit) {
        review.onEdit({ rawMs: parsed?.rawMs ?? null, penalty, inspectionPenalty: inspection }); setEdit(null); return;
      }
      const next = updateHistoryAttempt(save, edit.round.id, edit.attempt.id, { rawMs: parsed?.rawMs ?? null, penalty, inspectionPenalty: inspection });
      busyRef.current = true; setBusy(true);
      if (await onSave(next)) setEdit(null); else setError('The edit was not saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid result.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const quickPenalty = async (round: Round, attempt: Attempt, value: Penalty) => {
    if (disabled || busyRef.current) return;
    if (attempt.id === review?.attemptId) { review.onPenalty(value); return; }
    try {
      busyRef.current = true; setBusy(true); setError('');
      // Match the desktop's single final-penalty selection, including inspection corrections.
      if (!await onSave(updateHistoryAttempt(save, round.id, attempt.id, { penalty: value, inspectionPenalty: 'none' }))) setError('The penalty was not saved.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save penalty.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const renderCard = (round: Round | null, index: number) => {
    const definition = getEvent(round?.eventId ?? eventId);
    const score = round ? scoreRound(round) : null;
    const beforeLast = round?.attempts.length === definition.attemptCount ? { ...round, attempts: round.attempts.slice(0, -1) } : round;
    const possible = beforeLast?.attempts.length === definition.attemptCount - 1 ? possibleResults(beforeLast) : null;
    return <View style={styles.scorecard}>
      <View style={styles.fields}><View style={{ flex: 1 }}><Text style={[styles.fieldLabel, muted]}>Event</Text><Text style={[styles.fieldValue, text]}>{definition.name}</Text></View><View><Text style={[styles.fieldLabel, muted]}>Round</Text><Text style={[styles.fieldValue, number]}>{String(index).padStart(2, '0')}</Text></View></View>
      <Text style={[styles.fieldLabel, muted, { marginBottom: 8 }]}>Result</Text>
      {Array.from({ length: definition.attemptCount }, (_, i) => {
        const attempt = round?.attempts[i];
        return <View key={i} style={styles.solveRow}>
          <Text style={[styles.index, muted]}>{i + 1}</Text>
          <Pressable style={[styles.timeBox, { borderColor: theme.border }]} disabled={!attempt || disabled || (attempt.id === review?.attemptId && !review.onEdit)} accessibilityRole="button" accessibilityLabel={attempt ? `Edit solve ${i + 1}: ${formatAttempt(attempt)}` : `Solve ${i + 1}, empty`} onPress={() => attempt && round && openEdit(round, attempt)}>
            <Text style={[styles.result, number, score?.discardedIndices.includes(i) && { color: theme.muted }]}>{attempt ? formatAttempt(attempt) : '—'}</Text>
          </Pressable>
          <View style={styles.penalties}>{(['+2', 'DNF'] as const).map(value => {
            const selected = attempt && selectedPenalty(attempt) === value;
            const next: Penalty = selected ? 'none' : value;
            const unavailable = !attempt || disabled || busy || (attempt.rawMs === null && next !== 'DNF') || (attempt.id === review?.attemptId && review.interrupted && next !== 'DNF');
            return <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} for solve ${i + 1}`} accessibilityState={{ selected: Boolean(selected), disabled: unavailable }} disabled={unavailable} onPress={() => attempt && round && void quickPenalty(round, attempt, next)} style={[styles.penalty, { opacity: !attempt ? 0 : unavailable ? .3 : 1 }]}><Text style={{ color: selected ? theme.accent : theme.muted, fontFamily: theme.numberFontFamily, fontWeight: selected ? '700' : '400', fontSize: 13 }}>{value}</Text></Pressable>;
          })}</View>
        </View>;
      })}
      <View style={[styles.average, { borderBottomColor: theme.border }]}><Text style={[styles.fieldValue, muted]}>{formatLabel(definition.format)}</Text><Text style={[styles.averageValue, number]}>{scoreText(score)}</Text></View>
      <View style={styles.bounds}><Text style={muted}>Best possible</Text><Text style={number}>{scoreText(possible?.best ?? null)}</Text></View>
      <View style={styles.bounds}><Text style={muted}>Worst possible</Text><Text style={number}>{scoreText(possible?.worst ?? null)}</Text></View>
      {round?.goalMs !== undefined && <View style={styles.bounds}><Text style={muted}>Goal</Text><Text style={number}>{formatTime(round.goalMs)}</Text></View>}
    </View>;
  };
  const selector = <>
    <Pressable disabled={disabled || busy} accessibilityRole="button" accessibilityLabel={`Choose event. ${event.name}`} onPress={() => setEventsOpen(value => !value)} style={styles.selector}><EventIcon eventId={eventId} /><Text style={[styles.eventName, text]}>{event.name}</Text><Text style={[{ fontSize: 18 }, muted]}>{eventsOpen ? '⌃' : '⌄'}</Text></Pressable>
    {eventsOpen && <View style={[styles.eventMenu, { borderColor: theme.border }]}><ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>{EVENTS.map(item => <Pressable key={item.id} disabled={disabled || busy} accessibilityRole="button" accessibilityState={{ selected: eventId === item.id }} onPress={() => { setEventsOpen(false); if (item.id !== eventId) onSelectEvent?.(item.id); }} style={styles.eventOption}><EventIcon eventId={item.id} size={20} /><Text style={[text, { fontSize: 16, color: item.id === eventId ? theme.accent : theme.text }]}>{item.name}</Text></Pressable>)}</ScrollView></View>}
  </>;
  return <View style={[styles.container, { backgroundColor: theme.background }]}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {selector}
      {!eventsOpen && renderCard(current, roundNumber)}
      {!!error && !edit && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text>}
      <Action title="History ↑" onPress={() => setHistoryOpen(true)} />
    </ScrollView>
    <Modal visible={historyOpen || edit !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) { if (edit) setEdit(null); else setHistoryOpen(false); } }}>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>{edit === null ? <>        <View style={styles.sheetHeading}><Text style={[styles.sheetTitle, text]}>{event.name} history</Text><Action title="Done" onPress={() => setHistoryOpen(false)} /></View>
        <FlatList data={rounds.slice().reverse()} keyExtractor={round => round.id} contentContainerStyle={styles.content} initialNumToRender={3} windowSize={5} ListEmptyComponent={<Text style={[muted, { paddingVertical: 32 }]}>No solves yet.</Text>} renderItem={({ item, index }) => <View style={{ marginBottom: 32 }}>{renderCard(item, rounds.length - index)}<Text style={[muted, { marginTop: 12 }]}>{new Date(item.createdAt).toLocaleString()}</Text></View>} />
</> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.sheetTitle, text]}>Solve {(edit?.attempt.index ?? 0) + 1}</Text>
        <TextInput accessibilityLabel="Original solve time in seconds" value={input} onChangeText={setInput} keyboardType="decimal-pad" style={[styles.input, number, { borderColor: theme.border }]} editable={!busy} />
        <View style={styles.options}>{(['none', '+2', 'DNF', 'DNS'] as const).map(value => <Action key={value} title={value === 'none' ? 'OK' : value} selected={penalty === value} disabled={busy} onPress={() => setPenalty(value)} />)}</View>
        {edit && getEvent(edit.round.eventId).inspection && <><Text style={muted}>Inspection correction</Text><View style={styles.options}>{(['none', '+2', 'DNF'] as const).map(value => <Action key={value} title={value === 'none' ? 'OK' : value} selected={inspection === value} disabled={busy} onPress={() => setInspection(value)} />)}</View></>}
        {!!error && <Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text>}
        <Action title={busy ? 'Saving…' : 'Save'} onPress={() => void apply()} disabled={busy || disabled} /><Action title="Cancel" onPress={() => setEdit(null)} disabled={busy} />
        <Text selectable style={[text, { lineHeight: 26 }]}>{edit?.attempt.scramble.notation}</Text>
      </ScrollView></KeyboardAvoidingView>}</SafeAreaView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1 }, content: { paddingHorizontal: 24, paddingVertical: 16, width: '100%', maxWidth: 620, alignSelf: 'center' },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, marginBottom: 24 }, eventName: { fontSize: 23, flex: 1 },
  eventMenu: { borderTopWidth: 1, borderBottomWidth: 1, marginBottom: 16 }, eventOption: { minHeight: 48, flexDirection: 'row', gap: 14, alignItems: 'center' },
  scorecard: { width: '100%' }, fields: { flexDirection: 'row', gap: 20, marginBottom: 20 }, fieldLabel: { fontSize: 13, marginBottom: 4 }, fieldValue: { fontSize: 18 },
  solveRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }, index: { width: 14, fontSize: 15 }, timeBox: { minHeight: 52, borderWidth: 1, flex: 1, justifyContent: 'center', paddingHorizontal: 12 }, result: { fontSize: 26 },
  penalties: { flexDirection: 'row' }, penalty: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  average: { minHeight: 64, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, marginBottom: 12 }, averageValue: { fontSize: 26 }, bounds: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  action: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center' }, options: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, input: { borderBottomWidth: 1, minHeight: 56, fontSize: 30, marginVertical: 24 }, sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 }, sheetTitle: { fontSize: 24, fontWeight: '500' },
});
