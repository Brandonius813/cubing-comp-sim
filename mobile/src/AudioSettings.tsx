import { Pressable, Text, View } from 'react-native';
import { LOCALES } from '../../src/locales';
import type { MobilePreferences } from './practice';
import { SelectSetting, SettingRow, Slider, Toggle, useMobileTheme } from './ui';
import { usePreferencePatch } from './preferences-ui';

export function AudioSettings({ preferences, onChange, onPreview, disabled }: { preferences: MobilePreferences; onChange: (value: MobilePreferences) => Promise<boolean>; onPreview: () => void; disabled: boolean }) {
  const theme = useMobileTheme();
  const { update, retry, error } = usePreferencePatch(preferences, onChange);
  return <View>
    <SettingRow label="Inspection Voice"><Toggle label="Inspection Voice" value={preferences.inspectionAudio ?? true} disabled={disabled} onChange={inspectionAudio => update({ inspectionAudio })} /></SettingRow>
    <SelectSetting label="Voice Language" value={preferences.voiceLanguage ?? 'en'} options={LOCALES.map(locale => ({ value: locale.id, label: locale.nativeName }))} disabled={disabled} onChange={voiceLanguage => update({ voiceLanguage })} />
    <SelectSetting label="Voice Style" value={preferences.voice ?? 'male-1'} options={[{ value: 'male-1', label: 'Male 1' }, { value: 'male-2', label: 'Male 2' }, { value: 'female-1', label: 'Female 1' }, { value: 'female-2', label: 'Female 2' }]} disabled={disabled} onChange={voice => update({ voice })} />
    <View style={{ paddingTop: 18 }}><Text style={{ color: theme.text, fontFamily: theme.fontFamily, fontSize: 17 }}>Volume</Text><Slider label="Voice volume" values={[Math.round((preferences.voiceVolume ?? 1) * 100)]} max={100} suffix="%" disabled={disabled} onChange={values => update({ voiceVolume: values[0] / 100 })} /></View>
    <Pressable accessibilityRole="button" disabled={disabled || !preferences.inspectionAudio} onPress={onPreview} style={{ minHeight: 52, justifyContent: 'center', opacity: disabled || !preferences.inspectionAudio ? .4 : 1 }}><Text style={{ color: theme.accent, fontFamily: theme.fontFamily, fontSize: 17 }}>Test voice</Text></Pressable>
    {error && <View><Text accessibilityRole="alert" style={{ color: theme.danger }}>{error}</Text><Pressable accessibilityRole="button" onPress={retry} style={{ paddingVertical: 12 }}><Text style={{ color: theme.accent }}>Retry</Text></Pressable></View>}
  </View>;
}
