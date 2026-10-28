import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { randomUUID } from 'expo-crypto';
import { parseCapture } from '../review/transfer';
import { WebView } from 'react-native-webview';
import { INK_SCRIPT, commandScript } from '../ink/engine';
import { isDemoUrl } from '../urls';
import { demoHtml } from './demo';
import { BrowserHandle, BrowserProps } from './types';
import { captureQuestionImage } from '../ask/capture';

export const BrowserSurface = forwardRef<BrowserHandle, BrowserProps>(function BrowserSurface(props, ref) {
  const webview = useRef<WebView>(null);
  const captureView = useRef<View>(null);
  const receiver = useRef<((raw: string, url: string) => void) | null>(null);
  const captureBusy = useRef(false);
  const loadedUrl = useRef(props.url);
  const demo = isDemoUrl(props.url);
  const source = useMemo(() => demo
    ? { html: demoHtml(props.url), baseUrl: 'https://sketchbrowser.local/' }
    : { uri: props.url }, [demo, props.url, props.requestId]);

  useImperativeHandle(ref, () => ({
    send: (command, id) => webview.current?.injectJavaScript(commandScript(command, id)),
    back: () => webview.current?.goBack(),
    forward: () => webview.current?.goForward(),
    reload: () => webview.current?.reload(),
    captureQuestion: async (selectionId, signal) => {
      if (captureBusy.current) throw new Error('이미 영역을 준비하고 있어요.');
      captureBusy.current = true;
      const nonce = randomUUID();
      try {
        return await captureQuestionImage({ nonce, selectionId, signal,
          exchange: (command, abort) => new Promise((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout>;
            const clean = () => { clearTimeout(timer); abort.removeEventListener('abort', cancelled); if (receiver.current === receive) receiver.current = null; };
            const cancelled = () => { clean(); reject(new Error('질문을 취소했어요.')); };
            const receive = (raw: string) => {
              if (raw.length > 4_001_000) return;
              try {
                const m = JSON.parse(raw);
                if (m.channel !== 'sketch-question-capture' || m.nonce !== nonce) return;
                clean();
                if (m.error) reject(new Error(typeof m.error === 'string' ? m.error.slice(0,200) : '영역을 다시 지정해 주세요.'));
                else resolve(m);
              } catch { /* Ignore unrelated page messages. */ }
            };
            receiver.current = receive;
            timer = setTimeout(() => { clean(); reject(new Error('영역 준비가 지연됐어요. 다시 시도해 주세요.')); }, 7000);
            abort.addEventListener('abort', cancelled, { once: true });
            if (abort.aborted) { cancelled(); return; }
            webview.current?.injectJavaScript(commandScript(command));
          }),
          snapshot: async () => {
            await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            return captureRef(captureView, { format: 'png', result: 'base64', width: 1600 });
          },
          release: command => webview.current?.injectJavaScript(commandScript(command)),
        });
      } finally { captureBusy.current = false; }
    },
    captureReview: async () => {
      if (captureBusy.current) throw new Error('이미 화면을 준비하고 있어요.');
      captureBusy.current = true;
      const nonce = randomUUID();
      const ask = <T,>(type: 'capture' | 'captureCheck', parse: (raw: string, url: string) => T | null) => new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => { receiver.current = null; reject(new Error('화면 캡처가 지연됐어요. 다시 시도해 주세요.')); }, 7000);
        receiver.current = (raw, url) => {
          try { const result = parse(raw, url);
            if (result !== null) { clearTimeout(timer); receiver.current = null; resolve(result); }
          } catch (error) { clearTimeout(timer); receiver.current = null; reject(error); }
        };
        webview.current?.injectJavaScript(commandScript({ type, nonce }));
      });
      try {
        const context = await ask('capture', (raw, url) => {
          const value = parseCapture(raw, nonce, url);
          if (!value) { let m; try { m = JSON.parse(raw); } catch { return null; }
            if (m.channel === 'sketch-review' && m.nonce === nonce) throw new Error(typeof m.error === 'string' && m.error.length <= 500 ? m.error : '화면에 원문과 필기가 함께 보이도록 이동한 뒤 다시 시도해 주세요.'); }
          return value;
        });
        if (!context.currentSourceHash) throw new Error('글 버전을 확인할 수 없어요. 페이지를 새로고침해 주세요.');
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const image = await captureRef(captureView, { format: 'png', result: 'base64', width: 1600 });
        const stable = await ask('captureCheck', raw => {
          try { const m = JSON.parse(raw); return m.channel === 'sketch-review-check' && m.nonce === nonce ? Boolean(m.ok) : null; } catch { return null; }
        });
        if (!stable) throw new Error('캡처 중 화면이 움직였어요. 다시 시도해 주세요.');
        if (image.length > 4_000_000) throw new Error('화면 이미지가 커요. 더 작은 영역을 화면에 표시해 주세요.');
        return { context, image };
      } finally {
        captureBusy.current = false;
        receiver.current = null;
        webview.current?.injectJavaScript(commandScript({ type: 'captureRelease', nonce }));
      }
    },
  }), []);

  return <View ref={captureView} nativeID="sketch-ink-surface" collapsable={false} style={{flex:1}}><WebView
    ref={webview}
    source={source}
    style={{ flex: 1, backgroundColor: '#fbfaf6' }}
    originWhitelist={['http://*', 'https://*', 'about:blank']}
    onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || /^https?:\/\//i.test(request.url)}
    javaScriptEnabled
    domStorageEnabled
    setSupportMultipleWindows={false}
    allowsBackForwardNavigationGestures
    automaticallyAdjustContentInsets={false}
    contentInsetAdjustmentBehavior="never"
    mixedContentMode="never"
    allowFileAccess={false}
    injectedJavaScript={INK_SCRIPT}
    onLoadStart={() => { props.onError(null); props.onDocumentLoading(); }}
    onLoadEnd={() => webview.current?.injectJavaScript(INK_SCRIPT)}
    onNavigationStateChange={(state) => { loadedUrl.current = state.url; props.onNavigation({
      url: demo && (state.url === 'about:blank' || /^https:\/\/sketchbrowser\.local\/?$/.test(state.url)) ? props.url : state.url,
      canGoBack: state.canGoBack, canGoForward: state.canGoForward, loading: state.loading,
    }); }}
    onMessage={(event) => {
      receiver.current?.(event.nativeEvent.data, event.nativeEvent.url);
      props.onMessage(event.nativeEvent.data,
        demo && (event.nativeEvent.url === 'about:blank' || /^https:\/\/sketchbrowser\.local\/?$/.test(event.nativeEvent.url)) ? props.url : event.nativeEvent.url);
    }}
    onError={(event) => props.onError(`페이지를 열지 못했어요. 인터넷 연결과 주소를 확인해 주세요. (${event.nativeEvent.code})`)}
    onHttpError={(event) => { if (event.nativeEvent.url === loadedUrl.current && event.nativeEvent.statusCode >= 400) props.onError(`서버가 오류를 반환했어요. (HTTP ${event.nativeEvent.statusCode})`); }}
    onRenderProcessGone={() => props.onError('웹페이지가 종료됐어요. 새로고침해 주세요. 저장한 필기는 다시 불러옵니다.')}
    onContentProcessDidTerminate={() => webview.current?.reload()}
  /></View>;
});
