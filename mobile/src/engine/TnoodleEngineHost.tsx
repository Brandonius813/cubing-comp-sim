import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { ENGINE_DOCUMENT, ENGINE_VERSION } from '../../assets/engine.generated';
import type { EngineStatus } from './protocol';
import { type EngineBinding, MobileScrambleService } from './service';

interface Props { service: MobileScrambleService; onStatus?: (status: EngineStatus) => void }

/** An invisible computation host. All application controls remain native views. */
export const TnoodleEngineHost = memo(function TnoodleEngineHost({ service, onStatus }: Props) {
  const webview = useRef<WebView>(null);
  const status = useRef(onStatus); status.current = onStatus;
  const [binding, setBinding] = useState<EngineBinding | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const source = useMemo(() => binding ? {
    html: ENGINE_DOCUMENT.replace('"__CCS_ENGINE_CHANNEL__"', JSON.stringify(binding.channel)), baseUrl: 'about:blank',
  } : null, [binding]);
  useEffect(() => {
    setFailed(false);
    const connection = service.bind(ENGINE_VERSION, script => {
      if (!webview.current) throw new Error('Engine view is not mounted.');
      webview.current.injectJavaScript(script);
    }, value => { setFailed(value.phase === 'error'); status.current?.(value); }, () => setRevision(value => value + 1));
    setBinding(connection);
    return () => connection.dispose();
  }, [service, revision]);
  if (!binding || !source || failed) return null;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.host}>
    <WebView
      key={binding.channel}
      ref={webview}
      source={source}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      onMessage={event => binding.receive(event.nativeEvent.data)}
      onError={() => binding.fail()}
      onHttpError={() => binding.fail()}
      onContentProcessDidTerminate={() => binding.fail()}
      onRenderProcessGone={() => binding.fail()}
      javaScriptEnabled
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      domStorageEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      cacheEnabled={false}
      incognito
      mixedContentMode="never"
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      scrollEnabled={false}
      style={styles.webview}
    />
  </View>;
});

const styles = StyleSheet.create({
  // Keep mounted at a nonzero size. display:none may suspend a WebView.
  host: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden', left: 0, top: 0 },
  webview: { width: 1, height: 1, backgroundColor: 'transparent' },
});
