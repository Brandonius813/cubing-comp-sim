import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
import { formatTime, parseTimeInput } from "../../src/core/timing";
import { DEFAULT_SETTINGS, type FontFamily } from "../../src/storage/settings";
import { mobileSettings, type MobilePreferences } from "./practice";
import {
  MOBILE_FONT_OPTIONS,
  SelectSetting,
  SettingRow,
  Slider,
  Toggle,
  useMobileTheme,
} from "./ui";
import { usePreferencePatch } from "./preferences-ui";

interface Props {
  preferences: MobilePreferences;
  onChange: (preferences: MobilePreferences) => Promise<boolean>;
  disabled: boolean;
}
export function PracticeSettings({ preferences, onChange, disabled }: Props) {
  const settings = mobileSettings(preferences);
  const theme = useMobileTheme();
  const { update, retry, error } = usePreferencePatch(preferences, onChange);
  const [goal, setGoal] = useState(
    settings.goalMs === null ? "" : formatTime(settings.goalMs),
  );
  const [seconds, setSeconds] = useState(String(settings.waitSeconds));
  const [fieldError, setFieldError] = useState("");
  const goalFocused = useRef(false);
  useEffect(() => {
    if (!goalFocused.current)
      setGoal(settings.goalMs === null ? "" : formatTime(settings.goalMs));
  }, [settings.goalMs]);
  useEffect(() => {
    setSeconds(String(settings.waitSeconds));
  }, [settings.waitSeconds]);
  const text = {
    color: theme.text,
    fontFamily: theme.fontFamily,
    fontSize: 17,
  };
  const input = {
    ...text,
    minWidth: 90,
    maxWidth: 130,
    textAlign: "right" as const,
    padding: 10,
    borderBottomWidth: 1,
    borderColor: theme.border,
  };
  const fontValue = (value: FontFamily) =>
    value === "geist"
      ? "system"
      : value === "geist-mono"
        ? "system-mono"
        : value === "tahoma"
          ? "system"
          : value;
  return (
    <View>
      <SettingRow label="Enter times manually">
        <Toggle
          label="Enter times manually"
          value={settings.inputMethod === "manual"}
          disabled={disabled}
          onChange={(manual) =>
            update({ inputMethod: manual ? "manual" : "timer" })
          }
        />
      </SettingRow>
      <SettingRow label="Inspection">
        <Toggle
          label="Inspection"
          value={settings.inspection}
          disabled={disabled}
          onChange={(inspection) => update({ inspection })}
        />
      </SettingRow>
      <SettingRow label="Hold to start">
        <Toggle
          label="Hold to start"
          value={settings.holdMs > 0}
          disabled={disabled}
          onChange={(enabled) => update({ holdMs: enabled ? 550 : 0 })}
        />
      </SettingRow>
      <SelectSetting
        label="Wait duration"
        value={settings.waitEnabled ? settings.waitMode : "none"}
        options={[{ value: "fixed", label: "Fixed" }, { value: "random", label: "Random" }, { value: "none", label: "None" }]}
        disabled={disabled}
        onChange={mode => update(mode === "none" ? { waitEnabled: false } : { waitEnabled: true, waitMode: mode })}
      />
      {settings.waitEnabled && (
        <>
          {settings.waitMode === "fixed" ? (
            <SettingRow label="Wait seconds">
              <TextInput
                accessibilityLabel="Wait seconds"
                value={seconds}
                selectTextOnFocus
                onFocus={() => {
                  setSeconds("0");
                  update({ waitSeconds: 0 });
                }}
                onChangeText={(next) => {
                  setSeconds(next);
                  if (/^\d+$/.test(next) && Number(next) <= 300) {
                    setFieldError("");
                    update({ waitSeconds: Number(next) });
                  }
                }}
                onBlur={() => {
                  if (!/^\d+$/.test(seconds) || Number(seconds) > 300) {
                    setSeconds(String(settings.waitSeconds));
                    setFieldError("Wait must be between 0 and 300 seconds.");
                  }
                }}
                keyboardType="number-pad"
                editable={!disabled}
                maxLength={3}
                style={input}
              />
            </SettingRow>
          ) : (
            <View style={{ paddingTop: 16 }}>
              <Text style={text}>Wait range</Text>
              <Slider
                label="Wait seconds"
                values={[settings.waitMinSeconds, settings.waitMaxSeconds]}
                max={300}
                suffix="s"
                disabled={disabled}
                onChange={(values) =>
                  update({
                    waitMinSeconds: values[0],
                    waitMaxSeconds: values[1],
                  })
                }
              />
            </View>
          )}
        </>
      )}
      <SettingRow label="Round goal">
        <TextInput
          accessibilityLabel="Round goal"
          value={goal}
          onFocus={() => {
            goalFocused.current = true;
          }}
          placeholder="None"
          placeholderTextColor={theme.muted}
          keyboardType="decimal-pad"
          editable={!disabled}
          style={input}
          onChangeText={(next) => {
            setGoal(next);
            if (!next.trim()) {
              setFieldError("");
              update({ goalMs: null });
              return;
            }
            const parsed = parseTimeInput(next);
            if (parsed && parsed.rawMs !== null && parsed.penalty === "none") {
              setFieldError("");
              update({ goalMs: parsed.rawMs });
            }
          }}
          onBlur={() => {
            goalFocused.current = false;
            if (goal.trim() && !parseTimeInput(goal))
              setFieldError("Enter a valid goal time.");
          }}
        />
      </SettingRow>
      <View style={{ paddingTop: 16 }}>
        <Text style={text}>Scramble font size</Text>
        <Slider
          disabled={disabled}
          label="Scramble font size"
          values={[preferences.scrambleFontSize ?? 24]}
          min={16}
          max={40}
          onChange={(values) => update({ scrambleFontSize: values[0] })}
        />
      </View>
      <SelectSetting
        label="Timer Update"
        value={preferences.timerDisplay ?? "decimal"}
        options={[
          { value: "decimal", label: "Decimals" },
          { value: "seconds", label: "Whole seconds" },
          { value: "solve", label: "Solve" },
        ]}
        disabled={disabled}
        onChange={(timerDisplay) => update({ timerDisplay })}
      />
      <SettingRow label="Scramble drawing">
        <Toggle
          label="Scramble drawing"
          value={preferences.showScrambleDrawing ?? false}
          disabled={disabled}
          onChange={(showScrambleDrawing) => update({ showScrambleDrawing })}
        />
      </SettingRow>
      <SelectSetting
        label="Appearance"
        value={settings.theme}
        options={[
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        disabled={disabled}
        onChange={(theme) => update({ theme })}
      />
      <SelectSetting
        label="Text font"
        value={fontValue(settings.textFont)}
        options={MOBILE_FONT_OPTIONS}
        disabled={disabled}
        onChange={(textFont) => update({ textFont })}
      />
      <SelectSetting
        label="Number font"
        value={fontValue(settings.numberFont)}
        options={MOBILE_FONT_OPTIONS}
        disabled={disabled}
        onChange={(numberFont) => update({ numberFont })}
      />
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() =>
          Alert.alert(
            "Reset settings?",
            "Your solve history will stay on this device.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Reset",
                onPress: () =>
                  update({
                    ...DEFAULT_SETTINGS,
                    eventId: preferences.eventId,
                    language: preferences.language ?? "en",
                    showScrambleDrawing: false,
                    scrambleFontSize: 24,
                    timerDisplay: "decimal",
                    inspectionAudio: true,
                    voiceLanguage: "en",
                    voice: "male-1",
                    voiceVolume: 1,
                  }),
              },
            ],
          )
        }
        style={{ minHeight: 52, justifyContent: "center" }}
      >
        <Text style={{ ...text, color: theme.accent }}>Reset settings</Text>
      </Pressable>
      {error || fieldError ? (
        <View style={{ paddingVertical: 12 }}>
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {error || fieldError}
          </Text>
          {error && (
            <Pressable
              accessibilityRole="button"
              onPress={retry}
              style={{ paddingVertical: 12 }}
            >
              <Text style={{ color: theme.accent }}>Retry</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </View>
  );
}
