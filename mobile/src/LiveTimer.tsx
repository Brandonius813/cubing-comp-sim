import { useEffect, useState } from "react";
import { Text, type TextProps } from "react-native";

/** The ticking clock shown while a solve is running.
 *
 * It owns its own animation frame loop, so only this text redraws every frame.
 * Previously the whole practice screen re-rendered ~60 times a second, which
 * kept JavaScript busy and delayed handling of the stop tap. */
export function LiveTimer({
  startedAt,
  format,
  ...textProps
}: TextProps & { startedAt: number; format: (elapsedMs: number) => string }) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <Text {...textProps}>{format(Math.max(0, now - startedAt))}</Text>;
}
