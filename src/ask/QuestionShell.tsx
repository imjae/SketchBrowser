import { ReactNode } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export function QuestionShell({ children, onClose }: { children: ReactNode; onClose(): void }) {
  const { width } = useWindowDimensions();
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:'#18251c28',justifyContent:'flex-end',alignItems:width>=900?'flex-end':'stretch',padding:12}}>
      <View accessibilityViewIsModal style={{height:'78%',width:width>=900?480:'100%',maxWidth:'100%',backgroundColor:'#fbfaf6',borderRadius:14,overflow:'hidden',borderWidth:1,borderColor:'#cbd8c5'}}>
        <View style={{paddingHorizontal:18,paddingVertical:8,borderBottomWidth:1,borderColor:'#dce4d4',flexDirection:'row',alignItems:'center',gap:12}}>
          <View style={{flex:1}}><Text style={{fontSize:18,fontWeight:'600',color:'#29352d'}}>영역 질문</Text><Text style={{fontSize:12,color:'#65745f',marginTop:4}}>닫으면 답변이 사라져요.</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="답변 닫기" onPress={onClose} style={{minHeight:48,minWidth:56,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:16,color:'#375b42'}}>닫기</Text></Pressable>
        </View>
        {children}
      </View>
    </SafeAreaView></SafeAreaProvider>
  </Modal>;
}
