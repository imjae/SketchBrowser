import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { AUTHOR_ORIGIN } from '../review/transfer';
import { QUESTION_PATH, QuestionImage, questionTransferScript } from './protocol';
import { QuestionShell } from './QuestionShell';

export type QuestionPanelProps = { image: QuestionImage | null; error: string; onClose(): void };

export function QuestionPanel({ image, error, onClose }: QuestionPanelProps) {
  const webview = useRef<WebView>(null);
  const sent = useRef(false);
  const [networkError, setNetworkError] = useState('');
  const dispose = () => webview.current?.injectJavaScript(`if(location.origin===${JSON.stringify(AUTHOR_ORIGIN)}&&location.pathname===${JSON.stringify(QUESTION_PATH)})window.disposeSketchQuestion?.();true;`);
  useEffect(() => () => { dispose(); }, []);
  return <QuestionShell onClose={() => { dispose(); onClose(); }}>
    {error ? <Text accessibilityRole="alert" style={{padding:20,color:'#80502d',fontSize:16,lineHeight:25}}>{error}</Text> : !image ?
      <View style={{padding:24,gap:16}}><ActivityIndicator /><Text>선택한 영역을 준비하고 있어요.</Text></View> :
      <>
        {!!networkError && <View style={{padding:16,gap:8}}><Text accessibilityRole="alert">{networkError}</Text>
          {!sent.current && <Pressable accessibilityRole="button" onPress={() => { setNetworkError(''); webview.current?.reload(); }} style={{minHeight:48,justifyContent:'center'}}><Text>다시 연결</Text></Pressable>}
        </View>}
        <WebView ref={webview} source={{uri:`${AUTHOR_ORIGIN}${QUESTION_PATH}`}} style={{flex:1,backgroundColor:'#fbfaf6'}}
          sharedCookiesEnabled thirdPartyCookiesEnabled={false} javaScriptEnabled domStorageEnabled
          cacheEnabled={false} setSupportMultipleWindows={false} mixedContentMode="never" allowFileAccess={false}
          originWhitelist={['https://*']} startInLoadingState renderLoading={() => <ActivityIndicator />}
          onShouldStartLoadWithRequest={r => { try { const u = new URL(r.url); return u.protocol === 'https:' &&
            ((u.origin === AUTHOR_ORIGIN && (u.pathname === QUESTION_PATH || u.pathname.startsWith('/auth/'))) || u.hostname === 'github.com'); } catch { return false; } }}
          onMessage={event => {
            try {
              const u = new URL(event.nativeEvent.url);
              if(u.origin!==AUTHOR_ORIGIN || u.pathname!==QUESTION_PATH || event.nativeEvent.data.length>1000) return;
              const m=JSON.parse(event.nativeEvent.data);
              if(m.type==='sketch-question-ready' && !sent.current) {
                sent.current=true; webview.current?.injectJavaScript(questionTransferScript(image));
              }
            } catch { /* Only the exact owner page can receive the image. */ }
          }}
          onError={() => setNetworkError(sent.current ? '연결이 끊겼어요. 닫은 뒤 다시 질문해 주세요.' : '질문 서버에 연결하지 못했어요.')}
          onHttpError={e => { if(e.nativeEvent.url===`${AUTHOR_ORIGIN}${QUESTION_PATH}` && e.nativeEvent.statusCode>=400) setNetworkError('질문 서버가 아직 준비되지 않았어요.'); }}
        />
      </>}
  </QuestionShell>;
}
