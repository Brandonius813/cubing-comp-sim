import { useMemo } from 'react';
import { SvgXml } from 'react-native-svg';
import { nativeScrambleSvg } from './scramble-svg';

export function PuzzleDrawing({ svg, eventId, height = '100%' }: { svg: string; eventId: string; height?: number | string }) {
  const xml = useMemo(() => nativeScrambleSvg(svg, eventId), [svg, eventId]);
  return <SvgXml xml={xml} width="100%" height={height} />;
}
