import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FORMAT_LABELS, getEvent } from '../../src/core/events';
import { scoreRound } from '../../src/core/scoring';
import { formatAttempt, formatTime, parseTimeInput } from '../../src/core/timing';
import type { Attempt, InspectionPenalty, Penalty, Round } from '../../src/core/types';
import { eventSummary, updateHistoryAttempt } from './history';
import type { MobileSave } from './practice';

const colors = { background: '#0d1118', panel: '#161e2a', border: '#293447', text: '#f4f7fc', muted: '#a5b2c7', accent: '#438cff' };
function Action({ title, onPress, disabled = false, selected = false }: { title: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled, selected }} style={[styles.action, selected && styles.selected, disabled && { opacity: 0.45 }]}><Text style={styles.text}>{title}</Text></Pressable>;
}

const HistoryRound = memo(function HistoryRound({ round, disabled, onEdit }: { round: Round; disabled: boolean; onEdit: (round: Round, attempt: Attempt) => void }) {
  const score = scoreRound(round);
  return <View style={styles.card}>
    <View style={styles.row}><Text style={styles.heading}>{getEvent(round.eventId).name}</Text><Text style={styles.muted}>{FORMAT_LABELS[round.format]}</Text></View>
    <Text style={styles.muted}>{new Date(round.createdAt).toLocaleString()}</Text>
    {round.attempts.map(attempt => <Pressable key={attempt.id} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Edit solve ${attempt.index + 1}: ${formatAttempt(attempt)}`} accessibilityState={{ disabled }} onPress={() => onEdit(round, attempt)} style={styles.solve}>
      <Text style={styles.muted}>Solve {attempt.index + 1}</Text><Text style={[styles.result, score.discardedIndices.includes(attempt.index) && styles.muted]}>{formatAttempt(attempt)}</Text>
    </Pressable>)}
    <View style={styles.row}><Text style={styles.muted}>{score.status === 'incomplete' ? 'In progress' : 'Round result'}</Text><Text style={styles.result}>{score.status === 'ok' ? formatTime(score.valueMs) : score.status === 'DNF' ? 'DNF' : `${round.attempts.length}/${getEvent(round.eventId).attemptCount}`}</Text></View>
    {round.goalMs !== undefined && <Text style={styles.muted}>Goal: {formatTime(round.goalMs)}{score.status === 'ok' ? (score.valueMs! <= round.goalMs ? ' · Achieved' : ' · Not reached') : ''}</Text>}
  </View>;
});

export interface ScorecardProps {
  save: MobileSave;
  onSave: (next: MobileSave) => Promise<boolean>;
  disabled?: boolean;
  onExport?: () => void;
  /** Lock parent paging, but do not feed this editor's own lock into disabled. */
  onEditingChange?: (open: boolean) => void;
}

/** Virtualized history: keeps the number of mounted round cards bounded. */
export function Scorecard({ save, onSave, disabled = false, onExport, onEditingChange }: ScorecardProps) {
  const [edit, setEdit] = useState<{ round: Round; attempt: Attempt } | null>(null);
  const [input, setInput] = useState('');
  const [penalty, setPenalty] = useState<Penalty>('none');
  const [inspection, setInspection] = useState<InspectionPenalty>('none');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  useEffect(() => { onEditingChange?.(edit !== null); }, [edit !== null, onEditingChange]);
  useEffect(() => () => { onEditingChange?.(false); }, [onEditingChange]);
  const [error, setError] = useState('');
  const eventId = save.preferences.eventId;
  const rounds = useMemo(() => save.history.rounds.filter(round => round.eventId === eventId).slice().reverse(), [save.history.rounds, eventId]);
  const summary = useMemo(() => eventSummary(save, eventId), [save, eventId]);
  const openEdit = (round: Round, attempt: Attempt) => {
    setEdit({ round, attempt }); setInput(attempt.rawMs === null ? '' : (attempt.rawMs / 1000).toFixed(3));
    setPenalty(attempt.penalty); setInspection(attempt.inspectionPenalty); setError('');
  };
  const apply = async () => {
    if (!edit || busyRef.current || disabled) return;
    const parsed = input.trim() ? parseTimeInput(input) : null;
    if (input.trim() && (!parsed || parsed.rawMs === null || parsed.penalty !== 'none')) { setError('Enter a time without a penalty suffix. Use the penalty buttons below.'); return; }
    try {
      const next = updateHistoryAttempt(save, edit.round.id, edit.attempt.id, { rawMs: parsed?.rawMs ?? null, penalty, inspectionPenalty: inspection });
      busyRef.current = true; setBusy(true);
      if (await onSave(next)) setEdit(null);
      else setError('The edit was not saved. Your previous result is unchanged.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Invalid result.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <View style={styles.container}>
    <FlatList data={rounds} keyExtractor={round => round.id} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.card}><Text style={styles.title}>Scorecard</Text><Text style={styles.heading}>{getEvent(eventId).name}</Text><Text style={styles.muted}>{summary.completed} completed rounds · {summary.attempts} solves</Text><Text style={styles.text}>Best single: {summary.bestSingle === null ? '—' : formatTime(summary.bestSingle)}</Text><Text style={styles.text}>Best round: {summary.bestRound === null ? '—' : formatTime(summary.bestRound)}</Text><Text style={styles.muted}>Tap a solve to view its scramble or correct the result.</Text>{onExport && <Action title="Export all history" onPress={onExport} disabled={disabled} />}</View>}
      ListEmptyComponent={<Text style={styles.empty}>No solves for this event yet. Start a round on Practice.</Text>}
      renderItem={({ item }) => <HistoryRound round={item} disabled={disabled} onEdit={openEdit} />} />
    <Modal visible={edit !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) setEdit(null); }}>
      <SafeAreaView style={styles.container}><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Edit solve {(edit?.attempt.index ?? 0) + 1}</Text>
        <Text style={styles.muted}>Original time in seconds. Penalties are applied separately.</Text>
        <TextInput accessibilityLabel="Original solve time in seconds" value={input} onChangeText={setInput} keyboardType="decimal-pad" style={styles.input} editable={!busy} />
        <Text style={styles.heading}>Solve penalty</Text><View style={styles.options}>{(['none', '+2', 'DNF', 'DNS'] as const).map(value => <Action key={value} title={value === 'none' ? 'OK' : value} selected={penalty === value} disabled={busy} onPress={() => setPenalty(value)} />)}</View>
        {edit && getEvent(edit.round.eventId).inspection && <><Text style={styles.heading}>Inspection correction</Text><Text style={styles.muted}>Change only to correct an incorrectly recorded inspection penalty.</Text><View style={styles.options}>{(['none', '+2', 'DNF'] as const).map(value => <Action key={value} title={value === 'none' ? 'OK' : value} selected={inspection === value} disabled={busy} onPress={() => setInspection(value)} />)}</View></>}
        {error !== '' && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Action title={busy ? 'Saving…' : 'Save correction'} onPress={() => void apply()} disabled={busy || disabled} />
        <Action title="Cancel" onPress={() => setEdit(null)} disabled={busy} />
        <Text style={styles.heading}>Scramble</Text><Text selectable style={styles.text}>{edit?.attempt.scramble.notation}</Text><Text selectable style={styles.muted}>Engine: {edit?.attempt.scramble.engineVersion}</Text>
      </ScrollView></KeyboardAvoidingView></SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background }, content: { padding: 16, paddingBottom: 32, width: '100%', maxWidth: 760, alignSelf: 'center', gap: 12 },
  card: { backgroundColor: colors.panel, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 12, gap: 10 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' }, heading: { color: colors.text, fontSize: 18, fontWeight: '600' }, text: { color: colors.text, fontSize: 16 }, muted: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, solve: { minHeight: 48, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }, result: { color: colors.text, fontSize: 22, fontVariant: ['tabular-nums'] },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, action: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 10, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }, selected: { backgroundColor: '#17437a', borderColor: colors.accent },
  input: { color: colors.text, backgroundColor: colors.panel, padding: 14, minHeight: 48, fontSize: 24, borderRadius: 10, borderWidth: 1, borderColor: colors.border }, empty: { color: colors.muted, fontSize: 17, padding: 20 }, error: { color: '#ff8585', fontSize: 16 },
});
