import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ColorSchemeName,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { FontFamily } from "../../src/storage/settings";
import type { MobilePreferences } from "./practice";

export const MOBILE_FONT_OPTIONS: { value: FontFamily; label: string }[] = [
  { value: "system", label: "System" },
  { value: "system-mono", label: "System Mono" },
  { value: "arial", label: "Arial" },
  { value: "verdana", label: "Verdana" },
  { value: "trebuchet", label: "Trebuchet MS" },
  { value: "georgia", label: "Georgia" },
  { value: "times", label: "Times New Roman" },
  { value: "courier", label: "Courier New" },
];
export function nativeFont(
  value: FontFamily | undefined,
  numbers = false,
): string {
  const mono = Platform.OS === "ios" ? "Menlo" : "monospace";
  const fonts: Partial<Record<FontFamily, string>> = {
    "system-mono": mono,
    "geist-mono": mono,
    arial: "Arial",
    verdana: "Verdana",
    trebuchet: "TrebuchetMS",
    georgia: "Georgia",
    times: "TimesNewRomanPSMT",
    courier: "CourierNewPSMT",
  };
  const system = Platform.OS === "ios" ? "System" : "sans-serif";
  if (value === "system" || value === "geist" || value === "tahoma")
    return system;
  return (value && fonts[value]) || (numbers ? mono : system);
}
export function resolveMobileTheme(
  preferences: Partial<MobilePreferences> | undefined,
  system: ColorSchemeName = "light",
) {
  const dark =
    preferences?.theme === "dark" ||
    ((preferences?.theme ?? "system") === "system" && system === "dark");
  return {
    dark,
    background: dark ? "#101114" : "#ffffff",
    text: dark ? "#f1f2f4" : "#17191d",
    muted: dark ? "#92969e" : "#686c74",
    border: dark ? "#34373e" : "#d9dce1",
    field: dark ? "#1d2026" : "#f3f4f6",
    accent: dark ? "#79aaff" : "#2563eb",
    danger: dark ? "#ff8a8a" : "#b42318",
    success: dark ? "#61d69a" : "#137a47",
    fontFamily: nativeFont(preferences?.textFont),
    numberFontFamily: nativeFont(preferences?.numberFont, true),
  };
}
const ThemeContext = createContext(resolveMobileTheme(undefined));
export function MobileThemeProvider({
  preferences,
  children,
}: {
  preferences?: Partial<MobilePreferences>;
  children: ReactNode;
}) {
  const system = useColorScheme();
  return (
    <ThemeContext.Provider value={resolveMobileTheme(preferences, system)}>
      {children}
    </ThemeContext.Provider>
  );
}
export const PagerInteractionContext = createContext<(active: boolean) => void>(
  () => {},
);
export function useMobileTheme() {
  return useContext(ThemeContext);
}
export function SettingRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const theme = useMobileTheme();
  return (
    <View style={[ui.row, { borderBottomColor: theme.border }]}>
      <Text
        style={[ui.label, { color: theme.text, fontFamily: theme.fontFamily }]}
      >
        {label}
      </Text>
      <View style={ui.control}>{children}</View>
    </View>
  );
}
export function Toggle({
  label,
  value,
  disabled = false,
  onChange,
}: {
  label: string;
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const theme = useMobileTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[
        ui.toggle,
        {
          backgroundColor: value ? theme.accent : theme.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <View
        style={[ui.thumb, { alignSelf: value ? "flex-end" : "flex-start" }]}
      />
    </Pressable>
  );
}
export function SelectSetting<T extends string>({
  label,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const theme = useMobileTheme();
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingRow label={label}>
        <Pressable
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${options.find((item) => item.value === value)?.label ?? value}`}
          accessibilityState={{ expanded: open, disabled }}
          onPress={() => setOpen(true)}
          style={[ui.select, { opacity: disabled ? 0.4 : 1 }]}
        >
          <Text
            style={{
              color: theme.muted,
              fontSize: 16,
              fontFamily: theme.fontFamily,
            }}
          >
            {options.find((item) => item.value === value)?.label ?? value} ▾
          </Text>
        </Pressable>
      </SettingRow>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
          <View style={ui.sheetHeader}>
            <Text
              accessibilityRole="header"
              style={{
                color: theme.text,
                fontSize: 22,
                fontFamily: theme.fontFamily,
              }}
            >
              {label}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              hitSlop={12}
            >
              <Text style={{ color: theme.accent, fontSize: 17 }}>Done</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 24 }}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: option.value === value }}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={[ui.option, { borderBottomColor: theme.border }]}
              >
                <Text
                  style={{
                    color: theme.text,
                    fontFamily: theme.fontFamily,
                    fontSize: 17,
                  }}
                >
                  {option.label}
                </Text>
                {option.value === value && (
                  <Text style={{ color: theme.accent }}>✓</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
/** One drag surface; two independently accessible thumbs when a range is used. */
export function Slider({
  label,
  values,
  max,
  min = 0,
  disabled = false,
  onChange,
  suffix = "",
}: {
  label: string;
  values: number[];
  max: number;
  min?: number;
  disabled?: boolean;
  onChange: (values: number[]) => void;
  suffix?: string;
}) {
  const theme = useMobileTheme();
  const setInteracting = useContext(PagerInteractionContext);
  useEffect(() => () => setInteracting(false), [setInteracting]);
  const [width, setWidth] = useState(1);
  const [draft, setDraft] = useState<number[] | null>(null);
  const dragging = useRef(false);
  const active = useRef(0);
  const track = useRef<View>(null);
  const origin = useRef<number | null>(null);
  const current = useRef(values);
  if (!dragging.current) current.current = values;
  const shown = draft ?? values;
  const select = (x: number) =>
    Math.max(
      min,
      Math.min(
        max,
        Math.round(min + ((x - 14) / Math.max(1, width - 28)) * (max - min)),
      ),
    );
  const change = (x: number) => {
    const next = current.current.slice();
    next[active.current] = select(x);
    if (next.length === 2)
      next[active.current] =
        active.current === 0
          ? Math.min(next[0], next[1])
          : Math.max(next[1], next[0]);
    current.current = next;
    setDraft(next);
  };
  const commit = () => {
    dragging.current = false;
    setInteracting(false);
    setDraft(null);
    onChange(current.current);
  };
  const left = shown.length === 2 ? (shown[0] - min) / (max - min) : 0;
  const right = (shown[shown.length - 1] - min) / (max - min);
  return (
    <View style={{ paddingVertical: 8, opacity: disabled ? 0.4 : 1 }}>
      <View
        ref={track}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ height: 48, justifyContent: "center" }}
        onTouchStart={() => {
          if (!disabled) setInteracting(true);
        }}
        onTouchEnd={() => setInteracting(false)}
        onTouchCancel={() => setInteracting(false)}
        onStartShouldSetResponderCapture={() => !disabled}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(event) => {
          const pageX = event.nativeEvent.pageX;
          setInteracting(true);
          dragging.current = true;
          origin.current = null;
          current.current = values;
          track.current?.measureInWindow((x) => {
            if (!dragging.current) return;
            origin.current = x;
            const point = select(pageX - x);
            active.current =
              values.length === 2 &&
              Math.abs(point - values[1]) <= Math.abs(point - values[0])
                ? 1
                : 0;
            change(pageX - x);
          });
        }}
        onResponderMove={(event) => {
          if (origin.current !== null)
            change(event.nativeEvent.pageX - origin.current);
        }}
        onResponderRelease={commit}
        onResponderTerminate={() => {
          dragging.current = false;
          setInteracting(false);
          setDraft(null);
        }}
      >
        <View
          pointerEvents="none"
          style={{
            marginHorizontal: 14,
            height: 3,
            borderRadius: 2,
            backgroundColor: theme.border,
          }}
        >
          <View
            style={{
              position: "absolute",
              height: 3,
              left: `${left * 100}%`,
              right: `${(1 - right) * 100}%`,
              backgroundColor: theme.accent,
            }}
          />
        </View>
        {shown.map((value, index) => (
          <View
            key={index}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel={
              shown.length === 2
                ? `${label} ${index ? "maximum" : "minimum"}`
                : label
            }
            accessibilityValue={{
              min: index ? shown[0] : min,
              max: shown.length === 2 && !index ? shown[1] : max,
              now: value,
              text: `${value}${suffix}`,
            }}
            accessibilityActions={[
              { name: "increment" },
              { name: "decrement" },
            ]}
            onAccessibilityAction={(event) => {
              if (disabled) return;
              const next = values.slice();
              next[index] = Math.max(
                index ? values[0] : min,
                Math.min(
                  values.length === 2 && !index ? values[1] : max,
                  value +
                    (event.nativeEvent.actionName === "increment" ? 1 : -1),
                ),
              );
              onChange(next);
            }}
            style={{
              position: "absolute",
              left: 14 + ((value - min) / (max - min)) * (width - 28) - 12,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: theme.background,
              borderWidth: 2,
              borderColor: theme.accent,
            }}
          />
        ))}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: shown.length === 2 ? "space-between" : "flex-end",
        }}
      >
        {shown.map((value, index) => (
          <Text
            key={index}
            style={{
              color: theme.muted,
              fontFamily: theme.numberFontFamily,
              fontSize: 14,
            }}
          >
            {value}
            {suffix}
          </Text>
        ))}
      </View>
    </View>
  );
}
const ui = StyleSheet.create({
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  label: { fontSize: 17, flexShrink: 1 },
  control: { flexShrink: 0, maxWidth: "60%" },
  toggle: { width: 46, height: 28, borderRadius: 14, padding: 3 },
  thumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },
  select: { minHeight: 40, justifyContent: "center" },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 24,
  },
  option: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
