import { forwardRef, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { INK_SCRIPT } from '../ink/engine';
import { isDemoUrl } from '../urls';
import { demoHtml } from './demo';
import { BrowserHandle, BrowserProps } from './types';

// Browser preview deliberately runs only our own sample documents. External sites
// belong in the native WebView; their framing policies cannot be bypassed here.
export const BrowserSurface = forwardRef<BrowserHandle, BrowserProps>(function BrowserSurface(props, ref) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props); latest.current = props;
  const [reload, setReload] = useState(0);
  const demo = isDemoUrl(props.url);
  const html = useMemo(() => demoHtml(props.url).replace('</body>', `<script>
    window.ReactNativeWebView = { postMessage: function(data) { parent.postMessage({kind:'sketch-ink', data:data}, '*'); } };
    ${INK_SCRIPT}
    <\/script></body>`), [props.url]);

  useLayoutEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframe.current?.contentWindow || event.data?.kind !== 'sketch-ink' || typeof event.data.data !== 'string') return;
      latest.current.onMessage(event.data.data, latest.current.url);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useLayoutEffect(() => {
    props.onDocumentLoading();
    props.onError(null);
    props.onNavigation({ url: props.url, canGoBack: false, canGoForward: false, loading: false });
  }, [props.url, props.requestId, reload]);

  useImperativeHandle(ref, () => ({
    send: (command, id) => {
      const content = iframe.current?.contentWindow as (Window & { __sketchBrowserInk?: { receive(command: object, id?: string): void } }) | null;
      content?.__sketchBrowserInk?.receive(command, id);
    },
    back: () => undefined,
    forward: () => undefined,
    reload: () => setReload((value) => value + 1),
    captureReview: async () => { throw new Error('필기 전송은 Android 앱에서 사용할 수 있어요.'); },
    captureQuestion: async () => { throw new Error('영역 이미지로 질문하기는 Android 앱에서 사용할 수 있어요.'); },
  }), []);

  if (!demo) return <View style={styles.empty}>
    <Text style={styles.title}>웹사이트는 Android 앱에서 열어 주세요.</Text>
    <Text style={styles.description}>이 화면은 필기를 체험하는 웹 미리보기입니다.{`\n`}위쪽 홈 버튼으로 연습 페이지에 돌아갈 수 있어요.</Text>
  </View>;
  return <iframe key={`${props.url}-${props.requestId}-${reload}`} ref={iframe} title="필기할 웹페이지" srcDoc={html}
    style={{ width: '100%', height: '100%', border: 0, background: '#fbfaf6', flex: 1 }} />;
});

const styles = StyleSheet.create({
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 14 },
  title: { fontSize: 22, fontWeight: '600', color: '#313b32', textAlign: 'center' },
  description: { fontSize: 15, color: '#788174', lineHeight: 25, textAlign: 'center' },
});
