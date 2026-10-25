import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { File, Paths } from 'expo-file-system';
import { AUTHOR_ORIGIN, Transfer, transferScript } from './transfer';

const pendingFile = () => new File(Paths.document, 'pending-blog-review.json');
export async function saveTransfer(transfer: Transfer) {
  const file = pendingFile();
  if (file.exists) throw new Error('미전송 필기가 있어요. 수정 요청 목록에서 전송하거나 폐기해 주세요.');
  file.write(JSON.stringify(transfer));
}

export function ReviewPanel({ visible, onClose }: { visible: boolean; onClose(): void }) {
  const compact = useWindowDimensions().width < 600;
  const view = useRef<WebView>(null);
  const [pending, setPending] = useState<Transfer | null>(null);
  const [error, setError] = useState('');
  const pendingRef = useRef<Transfer | null>(null); pendingRef.current = pending;
  useEffect(() => {
    if (!visible) return;
    setError('');
    void (async () => { try { const f = pendingFile(); setPending(f.exists ? JSON.parse(await f.text()) : null); } catch { setError('보관한 필기를 불러오지 못했어요.'); } })();
  }, [visible]);
  const send = () => { if (pendingRef.current) view.current?.injectJavaScript(transferScript(pendingRef.current)); };
  useEffect(() => { if (visible && pending) send(); }, [visible, pending]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:'#fbfaf6'}}>
      <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:4,gap:12,borderBottomWidth:1,borderColor:'#d9e1d5'}}>
        <Pressable onPress={onClose} accessibilityRole="button" style={{minHeight:48,justifyContent:'center',paddingHorizontal:8}}><Text style={{fontSize:16,color:'#375b42'}}>← 글로 돌아가기</Text></Pressable>
        <Text style={{flex:1,fontWeight:'600',color:'#29352d'}}>{compact ? '' : '블로그 수정 검토'}</Text>
        <Pressable onPress={() => view.current?.reload()} accessibilityRole="button" style={{minHeight:48,justifyContent:'center',paddingHorizontal:8}}><Text style={{fontSize:16,color:'#375b42'}}>새로고침</Text></Pressable>
      </View>
      {!!error && <Text style={{padding:12,color:'#a33'}}>{error}</Text>}
      <WebView ref={view} source={{uri:`${AUTHOR_ORIGIN}/sketch/`}} style={{flex:1}}
        sharedCookiesEnabled thirdPartyCookiesEnabled={false} javaScriptEnabled domStorageEnabled
        setSupportMultipleWindows={false} mixedContentMode="never" allowFileAccess={false}
        originWhitelist={['https://*']} startInLoadingState renderLoading={() => <ActivityIndicator />}
        onShouldStartLoadWithRequest={r => { try { const u = new URL(r.url); if(u.origin === 'https://imjae.github.io') { void Linking.openURL(u.href); return false; } return u.protocol === 'https:' && (u.origin === AUTHOR_ORIGIN || u.hostname === 'github.com'); } catch { return false; } }}
        onLoadEnd={send}
        onMessage={event => {
          try {
            const u = new URL(event.nativeEvent.url);
            if (u.origin !== AUTHOR_ORIGIN || u.pathname !== '/sketch/') return;
            const m = JSON.parse(event.nativeEvent.data);
            if (m.type === 'sketch-ready') send();
            if (m.type === 'sketch-save' && pendingRef.current && m.id === pendingRef.current.id && typeof m.instruction === 'string' && m.instruction.length <= 4000) {
              const updated = { ...pendingRef.current, instruction: m.instruction, reanchored: m.reanchored === true };
              pendingFile().write(JSON.stringify(updated)); pendingRef.current = updated; setPending(updated);
              view.current?.injectJavaScript(`if(location.origin===${JSON.stringify(AUTHOR_ORIGIN)}&&location.pathname==='/sketch/')window.sketchPersisted?.(${JSON.stringify(m.id)});true;`);
            }
            if (['sketch-submitted','sketch-discarded'].includes(m.type) && m.id === pendingRef.current?.id) {
              const f = pendingFile(); if (f.exists) f.delete(); setPending(null);
            }
          } catch { setError('수정 요청 연결을 확인하지 못했어요. 새로고침해 주세요.'); }
        }} onError={() => setError('서버 연결을 확인해 주세요. 미전송 필기는 기기에 보관돼요.')} />
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}
