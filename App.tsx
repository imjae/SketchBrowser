import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BrowserSurface } from './src/browser/BrowserSurface';
import { BrowserHandle, Navigation } from './src/browser/types';
import { DEFAULT_SETTINGS, InkSettings, Tool } from './src/model';
import { HOME_URL, PRACTICE_URL, isDemoUrl, resolveAddress, shortAddress } from './src/urls';
import { useNotebook } from './src/useNotebook';
import { Icon, IconName } from './src/ui/Icon';

const GREEN = '#48694f';
const COLORS = ['#315de8', '#343b37', '#d65c53', '#5f8965', '#e6bc42'];
const TOOLS: { tool: Tool; label: string; icon: IconName }[] = [
  { tool: 'browse', label: '탐색', icon: 'browse' },
  { tool: 'pen', label: '펜', icon: 'pen' },
  { tool: 'underline', label: '밑줄', icon: 'underline' },
  { tool: 'highlighter', label: '형광펜', icon: 'highlighter' },
  { tool: 'eraser', label: '지우개', icon: 'eraser' },
];

function IconButton({ name, label, onPress, disabled, active }: { name: IconName; label: string; onPress(): void; disabled?: boolean; active?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [s.iconButton, active && s.iconButtonActive, pressed && s.pressed, disabled && s.disabled]}>
    <Icon name={name} color={active ? GREEN : '#758074'} />
  </Pressable>;
}

export default function App() { return <SafeAreaProvider><SketchBrowser /></SafeAreaProvider>; }

function SketchBrowser() {
  const { width } = useWindowDimensions();
  const wide = width >= 1050;
  const compact = width < 680;
  const browser = useRef<BrowserHandle>(null);
  const [source, setSource] = useState({ url: HOME_URL, requestId: 0 });
  const [navigation, setNavigation] = useState<Navigation>({ url: HOME_URL, canGoBack: false, canGoForward: false, loading: false });
  const [address, setAddress] = useState(HOME_URL);
  const [settings, setSettings] = useState<InkSettings>(DEFAULT_SETTINGS);
  const [libraryOpen, setLibraryOpen] = useState(width >= 1050);
  const [pageError, setPageError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const notes = useNotebook(browser, settings);

  const navigate = useCallback((url: string) => {
    browser.current?.send({ type: 'flush' });
    setSettings((previous) => ({ ...previous, tool: 'browse' }));
    setSource((previous) => ({ url, requestId: previous.requestId + 1 }));
    setAddress(url); setPageError(null); setAddressError(null);
    if (!wide) setLibraryOpen(false);
  }, [wide]);

  const onNavigation = useCallback((state: Navigation) => {
    setNavigation(state);
    setAddress(state.url);
  }, []);

  useEffect(() => {
    const event = BackHandler.addEventListener('hardwareBackPress', () => {
      if (libraryOpen && !wide) { setLibraryOpen(false); return true; }
      if (navigation.canGoBack) { browser.current?.back(); return true; }
      if (navigation.url !== HOME_URL) { navigate(HOME_URL); return true; }
      return false;
    });
    return () => event.remove();
  }, [libraryOpen, wide, navigation, navigate]);

  const submitAddress = () => {
    try { navigate(resolveAddress(address)); } catch (error) { setAddressError((error as Error).message); }
  };
  const chooseTool = (tool: Tool) => setSettings((previous) => ({ ...previous, tool,
    color: tool === 'highlighter' ? '#e6bc42' : previous.tool === 'highlighter' ? '#315de8' : previous.color }));
  const saveLabels = { loading: '필기 불러오는 중', ready: '필기할 준비 완료', saving: '저장 중…', saved: '기기에 저장됨', error: '저장 확인 필요' };
  const currentTool = TOOLS.find((item) => item.tool === settings.tool)!;
  const error = addressError || notes.error || pageError;
  const webUnavailable = Platform.OS === 'web' && !isDemoUrl(navigation.url);

  const library = <View style={[s.sidebar, !wide && s.floatingSidebar]}>
    <View style={s.sidebarHeading}><Text style={s.sidebarTitle}>나의 서재</Text><Text style={s.countBadge}>{notes.pages.length}</Text>
      {!wide && <IconButton name="close" label="서재 닫기" onPress={() => setLibraryOpen(false)} />}</View>
    <Pressable accessibilityRole="button" accessibilityLabel="시작 노트 열기" onPress={() => navigate(HOME_URL)}
      style={[s.sideNav, navigation.url === HOME_URL && s.sideNavActive]}>
      <Icon name="globe" size={19} color={GREEN} /><Text style={s.sideNavText}>시작 노트</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="연습 노트 열기" onPress={() => navigate(PRACTICE_URL)}
      style={[s.sideNav, navigation.url === PRACTICE_URL && s.sideNavActive]}>
      <Icon name="note" size={19} color={GREEN} /><Text style={s.sideNavText}>연습 노트</Text>
    </Pressable>
    <View style={s.libraryLabel}><Text style={s.sectionLabel}>필기한 페이지</Text><Icon name="library" size={14} /></View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
      {notes.pages.length === 0 ? <View style={s.emptyLibrary}>
        <Icon name="note" size={30} color="#a7b29f" />
        <Text style={s.emptyTitle}>첫 생각을 남겨 보세요</Text>
        <Text style={s.emptyText}>페이지에 필기하면{`\n`}여기에 자동으로 모여요.</Text>
      </View> : notes.pages.map((page) => <Pressable key={page.url} accessibilityRole="button" accessibilityLabel={`저장한 페이지 열기: ${page.title}`}
        onPress={() => navigate(page.url)} style={[s.savedPage, navigation.url === page.url && s.savedPageActive]}>
        <View style={s.savedPageTop}><Icon name="note" size={16} color={GREEN} /><Text style={s.savedPageTitle} numberOfLines={2}>{page.title}</Text></View>
        <Text style={s.savedPageUrl} numberOfLines={1}>{shortAddress(page.url)}</Text>
        <Text style={s.savedPageMeta}>{page.strokes.length}개의 획 · {new Date(page.updatedAt).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={s.tipCard}><View style={s.tipTitle}><Icon name="pen" size={16} color={GREEN} /><Text style={s.tipTitleText}>작은 사용 팁</Text></View>
      <Text style={s.tipText}>읽고 이동할 땐 탐색,{`\n`}생각을 남길 땐 펜을 골라요.</Text>
      <Pressable accessibilityRole="button" onPress={() => navigate(PRACTICE_URL)} style={s.tipLink}><Text style={s.tipLinkText}>연습하러 가기</Text><Icon name="arrow" size={15} color={GREEN} /></Pressable>
    </View>
    <View style={s.localStorage}><Icon name="lock" size={12} color="#929b8b" /><Text style={s.localStorageText}>필기는 이 기기에 보관돼요</Text></View>
  </View>;

  return <SafeAreaView style={s.root} edges={['top', 'right', 'bottom', 'left']}>
    <StatusBar style="dark" />
    <View style={[s.header, compact && { paddingHorizontal: 14 }]}>
      <View style={s.brand}><View style={s.brandMark}><Icon name="pen" size={25} color="#f8faf5" /></View>
        <View><Text style={s.brandName}>SketchBrowser<Text style={s.brandDot}>.</Text></Text>
          {!compact && <Text style={s.brandTagline}>웹 위에 남기는 나만의 생각</Text>}</View>
      </View>
      <View style={s.headerActions}>
        {!compact && <View style={s.deviceBadge}><View style={s.greenDot} /><Text style={s.deviceText}>{Platform.OS === 'web' ? 'WEB PREVIEW' : 'ANDROID · TABLET'}</Text></View>}
        <Pressable accessibilityRole="button" accessibilityLabel="서재 열기 또는 닫기" onPress={() => setLibraryOpen(!libraryOpen)} style={[s.libraryButton, libraryOpen && s.libraryButtonActive]}>
          <Icon name="library" size={17} color={GREEN} /><Text style={s.libraryButtonText}>서재</Text>
        </Pressable>
      </View>
    </View>
    <View style={s.workspace}>
      {libraryOpen && wide && library}
      <View style={[s.main, compact && { padding: 8 }]}>
        <View style={s.browserCard}>
          <View style={[s.addressBar, compact && { paddingHorizontal: 6, gap: 2 }]}>
            <IconButton name="back" label="뒤로 가기" onPress={() => browser.current?.back()} disabled={!navigation.canGoBack} />
            {!compact && <IconButton name="forward" label="앞으로 가기" onPress={() => browser.current?.forward()} disabled={!navigation.canGoForward} />}
            <IconButton name="reload" label="새로고침" onPress={() => browser.current?.reload()} />
            <View style={s.addressField}>
              <Icon name={isDemoUrl(navigation.url) ? 'note' : 'globe'} size={16} color="#929a8d" />
              <TextInput accessibilityLabel="웹 주소 또는 검색어" style={s.addressInput} value={address} onChangeText={setAddress}
                onSubmitEditing={submitAddress} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" selectTextOnFocus
                placeholder="웹 주소 또는 검색어를 입력하세요" placeholderTextColor="#9ba395" />
              {navigation.loading ? <ActivityIndicator size="small" color={GREEN} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel="주소 열기" onPress={submitAddress} style={s.goButton}><Icon name="arrow" size={17} color={GREEN} /></Pressable>
            </View>
            <IconButton name="home" label="홈으로" onPress={() => navigate(HOME_URL)} />
          </View>
          <View style={s.toolbar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolbarContent}>
              <View style={s.toolGroup}>{TOOLS.map(({ tool, label, icon }) => <Pressable key={tool} accessibilityRole="button" accessibilityLabel={label}
                accessibilityState={{ selected: settings.tool === tool }} onPress={() => chooseTool(tool)}
                style={({ pressed }) => [s.toolButton, settings.tool === tool && s.toolButtonActive, pressed && s.pressed]}>
                <Icon name={icon} size={19} color={settings.tool === tool ? '#f7faf4' : '#7a8376'} /><Text style={[s.toolLabel, settings.tool === tool && s.toolLabelActive]}>{label}</Text>
              </Pressable>)}</View>
              <View style={s.divider} />
              <View style={s.colorGroup}>{COLORS.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`색상 ${color}`}
                accessibilityState={{ selected: color === settings.color }} onPress={() => setSettings((previous) => ({ ...previous, color }))}
                style={[s.colorRing, color === settings.color && { borderColor: color }]}><View style={[s.colorDot, { backgroundColor: color }]} /></Pressable>)}</View>
              <View style={s.divider} />
              <View style={s.widthGroup}>{[2, 3, 5].map((strokeWidth) => <Pressable key={strokeWidth} accessibilityRole="button" accessibilityLabel={`굵기 ${strokeWidth}`}
                accessibilityState={{ selected: strokeWidth === settings.width }} onPress={() => setSettings((previous) => ({ ...previous, width: strokeWidth }))}
                style={[s.widthButton, settings.width === strokeWidth && s.widthButtonActive]}><View style={{ width: strokeWidth + 2, height: strokeWidth + 2, borderRadius: 5, backgroundColor: '#53604e' }} /></Pressable>)}</View>
              <View style={s.divider} />
              <IconButton name="undo" label="실행 취소" onPress={() => browser.current?.send({ type: 'undo' })} disabled={!notes.history.canUndo} />
              <IconButton name="redo" label="다시 실행" onPress={() => browser.current?.send({ type: 'redo' })} disabled={!notes.history.canRedo} />
              <Pressable accessibilityRole="switch" accessibilityLabel="펜만 입력" accessibilityState={{ checked: settings.penOnly }}
                onPress={() => setSettings((previous) => ({ ...previous, penOnly: !previous.penOnly }))} style={[s.penOnly, settings.penOnly && s.penOnlyActive]}>
                <Icon name="pen" size={15} color={settings.penOnly ? GREEN : '#91998a'} /><Text style={[s.penOnlyText, settings.penOnly && { color: GREEN }]}>펜만</Text><View style={[s.switchTrack, settings.penOnly && { backgroundColor: GREEN }]}><View style={[s.switchThumb, settings.penOnly && { alignSelf: 'flex-end' }]} /></View>
              </Pressable>
            </ScrollView>
          </View>
          {error && <View style={s.errorBar}><Text style={s.errorText}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => { if (notes.error) notes.retrySave(); else if (addressError) setAddressError(null); else browser.current?.reload(); }} style={s.retryButton}><Text style={s.retryText}>{addressError ? '닫기' : '다시 시도'}</Text></Pressable></View>}
          {notes.limit && <View style={s.errorBar}><Text style={s.errorText}>이 페이지의 필기 용량에 도달했어요. 다른 페이지에 이어 쓰거나, 필요 없는 획을 지워 주세요.</Text></View>}
          {Platform.OS === 'web' && <View style={s.previewBar}><Text style={s.previewText}>웹 미리보기 · 연습 페이지의 필기를 체험할 수 있어요. 외부 웹사이트는 Android 앱에서 열어 주세요.</Text></View>}
          <View style={s.page}><BrowserSurface ref={browser} {...source} onMessage={notes.onMessage} onNavigation={onNavigation} onDocumentLoading={notes.onDocumentLoading} onError={setPageError} /></View>
          <View style={s.statusBar}>
            <View style={s.saveStatus}>{!webUnavailable && (notes.status === 'saving' || notes.status === 'loading') ? <ActivityIndicator size={12} color={GREEN} /> : <Icon name={notes.status === 'saved' ? 'check' : 'save'} size={13} color={notes.status === 'error' ? '#c47943' : GREEN} />}
              <Text accessibilityLiveRegion="polite" style={s.statusText}>{webUnavailable ? 'Android 앱에서 열어 주세요' : saveLabels[notes.status]}</Text></View>
            {!compact && <Text style={s.modeHint}>{settings.tool === 'browse' ? '탐색 모드 · 스크롤하고 링크를 열 수 있어요' : settings.penOnly ? `${currentTool.label} 모드 · 스타일러스만 입력해요` : `${currentTool.label} 모드 · 이동하려면 탐색을 선택하세요`}</Text>}
            <Text style={s.strokeCount}>{notes.strokeCount}개의 획</Text>
          </View>
        </View>
        {!compact && <View style={s.workspaceFooter}><Text style={s.footerText}>A LITTLE SPACE FOR YOUR THOUGHTS.</Text><Text style={s.footerVersion}>SketchBrowser 0.1</Text></View>}
      </View>
      {libraryOpen && !wide && <><Pressable accessibilityRole="button" accessibilityLabel="서재 바깥 영역 닫기" onPress={() => setLibraryOpen(false)} style={s.backdrop} />{library}</>}
    </View>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#edf0e8' },
  header: { height: 87, backgroundColor: '#fafbf7', borderBottomWidth: 1, borderColor: '#dde3d6', paddingHorizontal: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 }, brandMark: { width: 42, height: 45, borderRadius: 13, borderBottomRightRadius: 5, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontSize: 22, fontWeight: '700', letterSpacing: -0.9, color: '#333e32' }, brandDot: { color: '#78956c' }, brandTagline: { color: '#929b88', fontSize: 10, letterSpacing: 0.4, marginTop: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 24 }, deviceBadge: { flexDirection: 'row', alignItems: 'center', gap: 7 }, greenDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: '#8ca17b' }, deviceText: { fontSize: 9, fontWeight: '600', letterSpacing: 1.4, color: '#8e9885' },
  libraryButton: { height: 38, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#dce4d4', alignItems: 'center', flexDirection: 'row', gap: 7 }, libraryButtonActive: { backgroundColor: '#eaf0e4' }, libraryButtonText: { fontSize: 12, color: GREEN, fontWeight: '600' },
  workspace: { flex: 1, flexDirection: 'row' },
  sidebar: { width: 232, backgroundColor: '#f7f8f3', borderRightWidth: 1, borderColor: '#dfe5d7', paddingHorizontal: 18, paddingTop: 27, paddingBottom: 20 },
  floatingSidebar: { position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 30, width: 280, elevation: 8, shadowColor: '#283525', shadowOpacity: 0.15, shadowRadius: 20 }, backdrop: { position: 'absolute', inset: 0, backgroundColor: '#26312560', zIndex: 25 },
  sidebarHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 25, gap: 9, paddingHorizontal: 7 }, sidebarTitle: { fontSize: 16, fontWeight: '600', color: '#46513f', flex: 1 }, countBadge: { fontSize: 10, color: '#819475', backgroundColor: '#e6eddf', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  sideNav: { minHeight: 46, paddingHorizontal: 12, borderRadius: 7, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }, sideNavActive: { backgroundColor: '#e6eddf' }, sideNavText: { color: '#53654a', fontSize: 12, fontWeight: '500' },
  libraryLabel: { marginTop: 30, marginBottom: 16, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, sectionLabel: { fontSize: 10, color: '#939d8a', letterSpacing: 0.8 },
  emptyLibrary: { paddingTop: 38, alignItems: 'center', gap: 11 }, emptyTitle: { color: '#819077', fontSize: 12 }, emptyText: { color: '#a3ac9b', fontSize: 11, lineHeight: 19, textAlign: 'center' },
  savedPage: { padding: 12, borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: 'transparent' }, savedPageActive: { backgroundColor: '#eff3e9', borderColor: '#dce6d2' }, savedPageTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, savedPageTitle: { fontSize: 12, color: '#53634b', lineHeight: 19, fontWeight: '500', flex: 1 }, savedPageUrl: { marginTop: 7, fontSize: 10, color: '#96a08c' }, savedPageMeta: { marginTop: 8, fontSize: 9, color: '#a1aa97' },
  tipCard: { backgroundColor: '#ecf1e5', borderWidth: 1, borderColor: '#e1e8d8', padding: 16, borderRadius: 10, marginTop: 18 }, tipTitle: { flexDirection: 'row', gap: 7, alignItems: 'center' }, tipTitleText: { fontSize: 11, color: '#637756', fontWeight: '600' }, tipText: { fontSize: 11, lineHeight: 21, color: '#91a084', marginVertical: 12 }, tipLink: { flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 30 }, tipLinkText: { fontSize: 10, color: GREEN }, localStorage: { flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', marginTop: 23 }, localStorageText: { fontSize: 9, color: '#9da692' },
  main: { flex: 1, minWidth: 0, paddingHorizontal: 23, paddingTop: 23, paddingBottom: 13 }, browserCard: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe2d2', borderRadius: 12, overflow: 'hidden', elevation: 1, shadowColor: '#3d5032', shadowOpacity: 0.04, shadowRadius: 10 },
  addressBar: { height: 63, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#e8ece2', backgroundColor: '#fff' },
  iconButton: { width: 38, height: 40, borderRadius: 7, alignItems: 'center', justifyContent: 'center' }, iconButtonActive: { backgroundColor: '#e6eedf' }, disabled: { opacity: 0.3 }, pressed: { opacity: 0.6 },
  addressField: { flex: 1, minWidth: 0, height: 36, borderRadius: 7, paddingLeft: 12, gap: 9, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f5ee', borderWidth: 1, borderColor: '#e8ece1', marginHorizontal: 6 }, addressInput: { flex: 1, minWidth: 0, fontSize: 12, color: '#67745c', height: 34, padding: 0 }, goButton: { width: 35, height: 34, alignItems: 'center', justifyContent: 'center' },
  toolbar: { minHeight: 66, backgroundColor: '#fdfefa', borderBottomWidth: 1, borderColor: '#e1e7d9' }, toolbarContent: { paddingHorizontal: 16, gap: 4, alignItems: 'center', minHeight: 66 }, toolGroup: { flexDirection: 'row', alignItems: 'center', gap: 3 }, toolButton: { height: 38, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 7 }, toolButtonActive: { backgroundColor: GREEN }, toolLabel: { fontSize: 11, color: '#84907a' }, toolLabelActive: { color: '#fff' },
  divider: { width: 1, height: 23, backgroundColor: '#e1e7d8', marginHorizontal: 9 }, colorGroup: { flexDirection: 'row', alignItems: 'center', gap: 3 }, colorRing: { width: 27, height: 29, borderRadius: 15, borderWidth: 1.2, borderColor: 'transparent', justifyContent: 'center', alignItems: 'center' }, colorDot: { width: 17, height: 17, borderRadius: 10 }, widthGroup: { flexDirection: 'row', gap: 2 }, widthButton: { width: 26, height: 32, justifyContent: 'center', alignItems: 'center', borderRadius: 5 }, widthButtonActive: { backgroundColor: '#eaf0e2' },
  penOnly: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, marginLeft: 8, borderRadius: 7 }, penOnlyActive: { backgroundColor: '#edf2e7' }, penOnlyText: { fontSize: 11, color: '#929b88' }, switchTrack: { width: 25, height: 15, borderRadius: 10, backgroundColor: '#d7dece', justifyContent: 'center', paddingHorizontal: 2 }, switchThumb: { width: 11, height: 11, borderRadius: 8, backgroundColor: '#fff' },
  previewBar: { backgroundColor: '#f1f4eb', borderBottomWidth: 1, borderColor: '#e1e7d8', paddingHorizontal: 18, paddingVertical: 8 }, previewText: { color: '#8d9b80', fontSize: 10, lineHeight: 16 },
  errorBar: { backgroundColor: '#fff4e5', paddingVertical: 9, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, errorText: { color: '#a27037', fontSize: 12, lineHeight: 20, flex: 1 }, retryButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 7 }, retryText: { color: '#8e602d', fontSize: 12, fontWeight: '600' },
  page: { flex: 1, minHeight: 0, overflow: 'hidden', backgroundColor: '#fbfaf6' }, statusBar: { minHeight: 35, borderTopWidth: 1, borderColor: '#e2e8d9', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, backgroundColor: '#fcfdf9' }, saveStatus: { flexDirection: 'row', gap: 6, alignItems: 'center' }, statusText: { fontSize: 10, color: '#839575' }, modeHint: { fontSize: 10, color: '#a5ae9b' }, strokeCount: { fontSize: 10, color: '#929e85' }, workspaceFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 3 }, footerText: { fontSize: 8, letterSpacing: 1.7, color: '#a3ad97' }, footerVersion: { fontSize: 9, color: '#a3ad97' },
});
