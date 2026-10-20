import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { formatTime, parseTimeInput } from '../../src/core/timing';
import { mobileSettings, validateMobilePreferences, type MobilePreferences } from './practice';

interface Props {
  preferences: MobilePreferences;
  onChange: (preferences: MobilePreferences) => Promise<boolean>;
  disabled: boolean;
}

function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress}
    style={[styles.choice, selected && styles.selected, disabled && styles.disabled]}><Text style={styles.choiceText}>{label}</Text></Pressable>;
}

function SecondsField({ label, value, max, disabled, onChange }: { label: string; value: number; max: number; disabled: boolean; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState('');
  useEffect(() => { setText(String(value)); setError(''); }, [value]);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={text} editable={!disabled} keyboardType="number-pad" maxLength={3} style={styles.input}
      onChangeText={next => {
        setText(next);
        if (!/^\d+$/.test(next) || Number(next) > max) { setError(`Enter whole seconds from 0 to ${max}.`); return; }
        setError(''); onChange(Number(next));
      }} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}

/** Valid settings are persisted immediately; incomplete inputs stay local. */
export function PracticeSettings({ preferences, onChange, disabled }: Props) {
  const settings = mobileSettings(preferences);
  const [message, setMessage] = useState('');
  const [goalText, setGoalText] = useState(settings.goalMs === null ? '' : formatTime(settings.goalMs));
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const pending = useRef<Partial<MobilePreferences>>({});
  const saving = useRef(false);
  const goalEditing = useRef(false);
  useEffect(() => {
    if (!goalEditing.current) setGoalText(settings.goalMs === null ? '' : formatTime(settings.goalMs));
  }, [settings.goalMs]);

  const drain = async () => {
    if (saving.current) return;
    saving.current = true;
    try {
      while (Object.keys(pending.current).length) {
        const patch = pending.current; pending.current = {};
        const next = validateMobilePreferences({ ...preferencesRef.current, ...patch });
        const saved = await onChange(next);
        if (!saved) { pending.current = { ...patch, ...pending.current }; setMessage('Settings could not be saved. Tap Retry settings.'); return; }
        // A rapid second edit must build on the last accepted edit even before
        // React supplies the corresponding preferences prop.
        preferencesRef.current = next;
        setMessage('');
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Settings could not be saved.'); }
    finally { saving.current = false; }
  };
  const update = (patch: Partial<MobilePreferences>) => {
    try {
      validateMobilePreferences({ ...preferencesRef.current, ...pending.current, ...patch });
      pending.current = { ...pending.current, ...patch };
      void drain();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invalid setting.'); }
  };

  return <View style={styles.card}>
    <Text style={styles.title}>Practice</Text>
    <View style={styles.row}><View style={styles.copy}><Text style={styles.label}>Inspection</Text><Text style={styles.body}>15 seconds for supported events.</Text></View>
      <Switch accessibilityLabel="Use inspection" value={settings.inspection} disabled={disabled} onValueChange={inspection => update({ inspection })} />
    </View>
    <Text style={styles.label}>Hold to start</Text>
    <View style={styles.choices} accessibilityRole="radiogroup">{[0, 300, 550, 1000].map(holdMs => <Choice key={holdMs} label={holdMs ? `${holdMs / 1000}s` : 'No delay'} selected={settings.holdMs === holdMs} disabled={disabled} onPress={() => update({ holdMs })} />)}</View>
    <Text style={styles.body}>Release to start, tap to stop. Leaving the app during inspection or timing marks the attempt DNF.</Text>
    <View style={styles.row}><View style={styles.copy}><Text style={styles.label}>Wait between solves</Text><Text style={styles.body}>Changes apply to the next scramble. A random wait is sampled once per solve.</Text></View>
      <Switch accessibilityLabel="Wait between solves" value={settings.waitEnabled} disabled={disabled} onValueChange={waitEnabled => update({ waitEnabled })} />
    </View>
    {settings.waitEnabled && <>
      <View style={styles.choices} accessibilityRole="radiogroup">{(['fixed', 'random'] as const).map(waitMode => <Choice key={waitMode} label={waitMode === 'fixed' ? 'Fixed' : 'Random'} selected={settings.waitMode === waitMode} disabled={disabled} onPress={() => update({ waitMode })} />)}</View>
      {settings.waitMode === 'fixed' ? <SecondsField label="Wait seconds (0–300)" value={settings.waitSeconds} max={300} disabled={disabled} onChange={waitSeconds => update({ waitSeconds })} /> : <>
        <Text style={styles.body}>Use a minimum no larger than the maximum. Both endpoints are included.</Text>
        <SecondsField label="Minimum seconds (0–180)" value={settings.waitMinSeconds} max={180} disabled={disabled} onChange={waitMinSeconds => update({ waitMinSeconds })} />
        <SecondsField label="Maximum seconds (0–180)" value={settings.waitMaxSeconds} max={180} disabled={disabled} onChange={waitMaxSeconds => update({ waitMaxSeconds })} />
      </>}
    </>}
    <Text style={styles.label}>Round goal (optional)</Text>
    <Text style={styles.body}>Applies when a new round starts. Use 12.34 or 10321 for 1:03.21. Clear to remove.</Text>
    <TextInput accessibilityLabel="Round goal" value={goalText} editable={!disabled} keyboardType="decimal-pad" placeholder="No goal" placeholderTextColor="#a5b2c7" style={styles.input}
      onFocus={() => { goalEditing.current = true; }} onBlur={() => { goalEditing.current = false; }} onChangeText={text => {
        setGoalText(text);
        if (!text.trim()) { update({ goalMs: null }); return; }
        const parsed = parseTimeInput(text);
        if (!parsed || parsed.rawMs === null || parsed.penalty !== 'none') { setMessage('Enter a valid goal time without a penalty.'); return; }
        update({ goalMs: parsed.rawMs });
      }} />
    {message ? <View style={styles.field}><Text accessibilityRole="alert" style={styles.error}>{message}</Text>
      {Object.keys(pending.current).length > 0 && <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { void drain(); }} style={styles.choice}><Text style={styles.choiceText}>Retry settings</Text></Pressable>}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: '#293447', borderRadius: 20, backgroundColor: '#161e2a', padding: 20, gap: 16 },
  title: { color: '#f4f7fc', fontSize: 19, fontWeight: '600' }, label: { color: '#f4f7fc', fontSize: 16 },
  body: { color: '#a5b2c7', fontSize: 14, lineHeight: 21 }, row: { flexDirection: 'row', alignItems: 'center', gap: 12 }, copy: { flex: 1, gap: 6 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 48, minWidth: 72, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#293447', borderRadius: 12, padding: 12 },
  selected: { backgroundColor: '#23436d', borderColor: '#438cff' }, choiceText: { color: '#f4f7fc', fontSize: 15, fontWeight: '600' }, disabled: { opacity: 0.45 },
  field: { gap: 8 }, input: { color: '#f4f7fc', borderWidth: 1, borderColor: '#52617a', borderRadius: 12, minHeight: 48, padding: 12, fontSize: 18 }, error: { color: '#ff8585', fontSize: 14 },
});
