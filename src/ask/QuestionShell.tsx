import { ReactNode, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../ui/Icon';
import { fitCard, placeQuestion, Position, QuestionPlacement } from './layout';

export function QuestionShell({ children, onClose, area, anchor }: QuestionPlacement & { children: ReactNode; onClose(): void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState<Position | null>(null);
  const dragStart = useRef<Position>({ x: 8, y: 8 });
  const width = Math.max(1, Math.min(440, area.width - 16));
  const bodyHeight = Math.max(56, Math.min(area.height - 16, expanded ? area.height * .72 : Math.max(220, Math.min(320, area.height * .36))));
  const card = { width, height: collapsed ? 56 : bodyHeight };
  const position = moved ? fitCard(moved, card, area) : placeQuestion(card, area, anchor);
  const currentPosition = useRef(position); currentPosition.current = position;
  const drag = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { dragStart.current = currentPosition.current; setDragging(true); },
    onPanResponderMove: (_, gesture) => setMoved(fitCard({ x: dragStart.current.x + gesture.dx, y: dragStart.current.y + gesture.dy }, card, area)),
    onPanResponderRelease: () => setDragging(false),
    onPanResponderTerminate: () => setDragging(false),
    onPanResponderTerminationRequest: () => false,
  }), [area.width, area.height, card.width, card.height]);

  return <>
    {/* During a fast drag, an iframe/WebView must not steal the pointer stream. */}
    {dragging && <View testID="question-drag-shield" style={[StyleSheet.absoluteFill, { zIndex: 19, elevation: 7 }]} />}
    <View testID="question-card" style={[s.card, { left: position.x, top: position.y, width, height: card.height }]}>
    <View style={s.header}>
      <View testID="question-drag-handle" accessibilityLabel="답변 카드 이동" {...drag.panHandlers} style={s.handle}>
        <Text numberOfLines={1} style={s.title}>영역 질문</Text>
        <Text numberOfLines={1} style={s.hint}>{collapsed ? '답변을 접어 두었어요' : '제목을 끌어 이동 · 닫으면 삭제'}</Text>
      </View>
      {!collapsed && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? '답변 작게 보기' : '답변 크게 보기'} onPress={() => setExpanded(v => !v)} style={s.button}>
        <Icon name={expanded ? 'minimize' : 'maximize'} size={18} color="#48694f" />
      </Pressable>}
      <Pressable accessibilityRole="button" accessibilityLabel={collapsed ? '답변 펼치기' : '답변 접기'} accessibilityState={{ expanded: !collapsed }} onPress={() => setCollapsed(v => !v)} style={s.button}>
        <Icon name={collapsed ? 'chevronUp' : 'chevronDown'} size={18} color="#48694f" />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="답변 닫기" onPress={onClose} style={s.button}>
        <Icon name="close" size={18} color="#48694f" />
      </Pressable>
    </View>
    {/* Keep the same WebView mounted and sized while folded: no reload or resubmit. */}
    <View pointerEvents={collapsed ? 'none' : 'auto'} accessibilityElementsHidden={collapsed} importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
      style={{ height: Math.max(0, bodyHeight - 56), opacity: collapsed ? 0 : 1 }}>
      {children}
    </View>
  </View></>;
}

const s = StyleSheet.create({
  card: { position: 'absolute', zIndex: 20, elevation: 8, backgroundColor: '#fbfaf6', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#cbd8c5', shadowColor: '#213c2b', shadowOpacity: .14, shadowRadius: 12 },
  header: { height: 56, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: '#dce4d4', flexDirection: 'row', alignItems: 'center' },
  handle: { flex: 1, minWidth: 0, height: 54, justifyContent: 'center', paddingLeft: 6 },
  title: { fontSize: 15, fontWeight: '600', color: '#29352d' },
  hint: { fontSize: 10, color: '#65745f', marginTop: 3 },
  button: { height: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
});
