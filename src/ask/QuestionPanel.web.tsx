import { Text } from 'react-native';
import { QuestionShell } from './QuestionShell';
import type { QuestionImage } from './protocol';

export function QuestionPanel({ error, onClose }: {image:QuestionImage|null;error:string;onClose():void}) {
  return <QuestionShell onClose={onClose}><Text accessibilityRole="alert" style={{padding:20,fontSize:16,lineHeight:25}}>{error || '영역 이미지로 질문하기는 Android 앱에서 사용할 수 있어요.'}</Text></QuestionShell>;
}
