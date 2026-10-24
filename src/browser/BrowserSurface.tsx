import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { WebView } from 'react-native-webview';
import { INK_SCRIPT, commandScript } from '../ink/engine';
import { isDemoUrl } from '../urls';
import { demoHtml } from './demo';
import { BrowserHandle, BrowserProps } from './types';

export const BrowserSurface = forwardRef<BrowserHandle, BrowserProps>(function BrowserSurface(props, ref) {
  const webview = useRef<WebView>(null);
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
  }), []);

  return <WebView
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
    onMessage={(event) => props.onMessage(event.nativeEvent.data,
      demo && (event.nativeEvent.url === 'about:blank' || /^https:\/\/sketchbrowser\.local\/?$/.test(event.nativeEvent.url)) ? props.url : event.nativeEvent.url)}
    onError={(event) => props.onError(`페이지를 열지 못했어요. 인터넷 연결과 주소를 확인해 주세요. (${event.nativeEvent.code})`)}
    onHttpError={(event) => { if (event.nativeEvent.url === loadedUrl.current && event.nativeEvent.statusCode >= 400) props.onError(`서버가 오류를 반환했어요. (HTTP ${event.nativeEvent.statusCode})`); }}
    onRenderProcessGone={() => props.onError('웹페이지가 종료됐어요. 새로고침해 주세요. 저장한 필기는 다시 불러옵니다.')}
    onContentProcessDidTerminate={() => webview.current?.reload()}
  />;
});
