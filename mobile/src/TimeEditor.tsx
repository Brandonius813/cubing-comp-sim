import { useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";
import { parseTimeInput, selectedPenalty } from "../../src/core/timing";
import type { Attempt, EventId, Penalty } from "../../src/core/types";
import { useMobileTheme } from "./ui";
export type ResultPatch = Pick<
  Attempt,
  "rawMs" | "penalty" | "inspectionPenalty"
>;
export type DrawScramble = (
  eventId: EventId,
  notation: string,
  signal?: AbortSignal,
) => Promise<string>;
export function TimeEditor({
  attempt,
  onChange,
  onDelete,
  onClose,
  drawScramble,
  initialSvg,
}: {
  attempt: Attempt;
  onChange: (patch: ResultPatch) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
  drawScramble?: DrawScramble;
  initialSvg?: string;
}) {
  const theme = useMobileTheme();
  const [input, setInput] = useState(
    attempt.rawMs === null ? "" : (attempt.rawMs / 1000).toFixed(2),
  );
  const [penalty, setPenalty] = useState<Penalty>(selectedPenalty(attempt));
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const last = useRef({ input, penalty });
  const [error, setError] = useState("");
  const [svg, setSvg] = useState(initialSvg ?? "");
  useEffect(() => {
    if (initialSvg || !drawScramble) return;
    const abort = new AbortController();
    void drawScramble(
      attempt.scramble.eventId,
      attempt.scramble.notation,
      abort.signal,
    )
      .then(setSvg)
      .catch(() => {
        if (!abort.signal.aborted) setError("Drawing unavailable.");
      });
    return () => abort.abort();
  }, [attempt.id, drawScramble, initialSvg]);
  const apply = async (nextPenalty = penalty) => {
    if (lock.current) return false;
    if (input === last.current.input && nextPenalty === last.current.penalty)
      return true;
    const parsed = input.trim() ? parseTimeInput(input) : null;
    if (
      input.trim() &&
      (!parsed || parsed.rawMs === null || parsed.penalty !== "none")
    ) {
      setError("Enter a valid time.");
      return false;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await onChange({
        rawMs: parsed?.rawMs ?? null,
        penalty: nextPenalty,
        inspectionPenalty: "none",
      });
      if (saved) {
        setPenalty(nextPenalty);
        const normalized = parsed?.rawMs == null ? "" : (parsed.rawMs / 1000).toFixed(2);
        setInput(normalized);
        last.current = { input: normalized, penalty: nextPenalty };
      } else setError("Could not save this change.");
      return saved;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not save this change.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const remove = () =>
    Alert.alert(
      "Delete solve?",
      "This removes the solve and recalculates the round.",
      [
        { text: "Keep solve", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (lock.current) return;
            lock.current = true;
            setBusy(true);
            void onDelete()
              .then((ok) => {
                if (ok) onClose();
                else setError("Could not delete solve.");
              })
              .catch(() => setError("Could not delete solve."))
              .finally(() => {
                lock.current = false;
                setBusy(false);
              });
          },
        },
      ],
    );
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 24, paddingTop: 28, gap: 18 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: theme.text, fontSize: 22 }}>
            Solve {attempt.index + 1}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close solve"
            disabled={busy}
            onPress={() => {
              void apply().then((ok) => {
                if (ok) onClose();
              });
            }}
            style={{ padding: 12 }}
          >
            <Text style={{ color: theme.text, fontSize: 26 }}>×</Text>
          </Pressable>
        </View>
        <Text
          selectable
          style={{
            color: theme.text,
            fontFamily: theme.fontFamily,
            fontWeight: "600",
            fontSize: 19,
            lineHeight: 28,
          }}
        >
          {attempt.scramble.notation}
        </Text>
        {svg ? (
          <SvgXml xml={svg} width="100%" height={190} />
        ) : (
          <Text style={{ color: theme.muted, textAlign: "center" }}>•••</Text>
        )}
        <TextInput
          accessibilityLabel="Solve time in seconds"
          value={input}
          onChangeText={setInput}
          selectTextOnFocus
          keyboardType="decimal-pad"
          editable={!busy}
          onBlur={() => {
            void apply();
          }}
          onSubmitEditing={() => {
            void apply();
          }}
          style={{
            color: theme.text,
            fontFamily: theme.numberFontFamily,
            fontSize: 42,
            textAlign: "center",
            padding: 12,
            borderBottomWidth: 1,
            borderColor: theme.border,
          }}
        />
        <View
          style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}
        >
          {(["none", "+2", "DNF", "DNS"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{
                selected: penalty === value,
                disabled: busy,
              }}
              disabled={busy}
              onPress={() => {
                void apply(value);
              }}
              style={{
                padding: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: penalty === value ? theme.accent : theme.border,
              }}
            >
              <Text
                style={{
                  color: penalty === value ? theme.accent : theme.text,
                  fontSize: 17,
                }}
              >
                {value === "none" ? "OK" : value}
              </Text>
            </Pressable>
          ))}
        </View>
        {!!error && (
          <Text accessibilityRole="alert" style={{ color: theme.danger }}>
            {error}
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={remove}
          style={{ padding: 14, alignItems: "center" }}
        >
          <Text style={{ color: theme.danger, fontSize: 17 }}>
            Delete solve
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
