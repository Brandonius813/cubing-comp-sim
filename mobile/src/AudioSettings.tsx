import { useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LOCALES } from '../../src/locales';
import type { MobilePreferences } from './practice';

export function AudioSettings({ preferences, onChange, onPreview, disabled }: { preferences: MobilePreferences; onChange: (value: MobilePreferences) => Promise<boolean>; onPreview: () => void; disabled: boolean }) {
  const [languages, setLanguages] = useState(false);
  const update = (patch: Partial<MobilePreferences>) => { void onChange({ ...preferences, ...patch }); };
  return <View style={styles.card}>
    <Text style={styles.title}>Inspection voice</Text>
    <View style={styles.row}><Text style={styles.text}>Recorded 8 and 12 second calls</Text><Switch accessibilityLabel="Inspection voice enabled" value={preferences.inspectionAudio ?? true} disabled={disabled} onValueChange={inspectionAudio => update({ inspectionAudio })} /></View>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={() => setLanguages(true)} style={styles.button}><Text style={styles.text}>Voice language: {LOCALES.find(item => item.id === preferences.voiceLanguage)?.nativeName ?? 'English'}</Text></Pressable>
    <View style={styles.row}>{(['male-1', 'male-2', 'female-1', 'female-2'] as const).map(voice => <Pressable key={voice} accessibilityRole="radio" accessibilityState={{ checked: (preferences.voice ?? 'male-1') === voice, disabled }} disabled={disabled} onPress={() => update({ voice })} style={[styles.button, preferences.voice === voice && styles.selected]}><Text style={styles.text}>{voice.replace('female-', 'Female ').replace('male-', 'Male ')}</Text></Pressable>)}</View>
    <Text style={styles.text}>Volume</Text><View style={styles.row}>{[0, .25, .5, .75, 1].map(voiceVolume => <Pressable key={voiceVolume} accessibilityRole="radio" accessibilityLabel={`Voice volume ${voiceVolume * 100} percent`} accessibilityState={{ checked: preferences.voiceVolume === voiceVolume, disabled }} disabled={disabled} style={[styles.button, preferences.voiceVolume === voiceVolume && styles.selected]} onPress={() => update({ voiceVolume })}><Text style={styles.text}>{voiceVolume * 100}%</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" disabled={disabled || !preferences.inspectionAudio} style={styles.button} onPress={onPreview}><Text style={styles.text}>Test voice</Text></Pressable>
    <Text style={styles.caption}>Recordings work offline. Interface text is currently English.</Text>
    <Modal visible={languages} presentationStyle="pageSheet" animationType="slide" onRequestClose={() => setLanguages(false)}><SafeAreaView style={styles.screen}><ScrollView contentContainerStyle={styles.card}><Text style={styles.title}>Voice language</Text><Pressable style={styles.button} accessibilityRole="button" onPress={() => setLanguages(false)}><Text style={styles.text}>Cancel</Text></Pressable>{LOCALES.map(item => <Pressable accessibilityRole="button" style={styles.button} key={item.id} disabled={disabled} onPress={() => { update({ voiceLanguage: item.id }); setLanguages(false); }}><Text style={styles.text}>{item.nativeName}</Text></Pressable>)}</ScrollView></SafeAreaView></Modal>
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#0d1118' }, card: { padding: 20, borderRadius: 20, backgroundColor: '#161e2a', gap: 14 }, title: { color: '#f4f7fc', fontSize: 19, fontWeight: '600' }, text: { color: '#f4f7fc', fontSize: 15 }, caption: { color: '#a5b2c7', fontSize: 13 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }, button: { minHeight: 48, padding: 12, justifyContent: 'center', borderWidth: 1, borderColor: '#293447', borderRadius: 10 }, selected: { borderColor: '#438cff', backgroundColor: '#23436d' } });
