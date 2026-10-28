import { ScrollView, Text } from 'react-native';
import { QuestionShell } from './QuestionShell';
import type { QuestionPanelProps } from './QuestionPanel';

export function QuestionPanel({ error, onClose, area, anchor }: QuestionPanelProps) {
  return <QuestionShell area={area} anchor={anchor} onClose={onClose}><ScrollView><Text accessibilityRole="alert" style={{padding:16,fontSize:15,lineHeight:23}}>{error || '영역 이미지로 질문하기는 Android 앱에서 사용할 수 있어요.'}</Text></ScrollView></QuestionShell>;
}
