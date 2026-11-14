import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useMobileTheme } from './ui';

/** Mount with a new key for each scramble/font setting to reset scroll position. */
export function ScrambleNotation({ notation, fontSize }: { notation: string; fontSize: number }) {
  const theme = useMobileTheme();
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  const [offset, setOffset] = useState(0);
  const moreBelow = viewport > 0 && content - viewport - Math.max(0, offset) > 4;
  return <View testID="scramble-notation-box" style={{ flex: 1, minHeight: 0, width: '100%' }}>
    <ScrollView testID="scramble-notation-scroll" style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingBottom: 20 }}
      onLayout={event => setViewport(event.nativeEvent.layout.height)}
      onContentSizeChange={(_, height) => setContent(height)}
      onScroll={event => setOffset(event.nativeEvent.contentOffset.y)} scrollEventThrottle={16}
      onTouchStart={event => event.stopPropagation()} onTouchEnd={event => event.stopPropagation()}>
      <Text style={{ color: theme.text, fontFamily: theme.fontFamily, textAlign: 'center',
        fontWeight: '600', fontSize, lineHeight: fontSize * 1.35 }}>{notation}</Text>
    </ScrollView>
    {moreBelow && <View pointerEvents="none" accessible accessibilityLabel="Scroll down for more scramble"
      testID="scramble-scroll-hint" style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
      <View style={{ width: 9, height: 9, borderRightWidth: 2, borderBottomWidth: 2,
        borderColor: theme.muted, transform: [{ rotate: '45deg' }], marginTop: -5 }} />
    </View>}
  </View>;
}
