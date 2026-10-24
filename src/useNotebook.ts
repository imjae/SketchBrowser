import AsyncStorage from '@react-native-async-storage/async-storage';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { BrowserHandle } from './browser/types';
import { InkSettings, PageNotes, parseInkMessage } from './model';
import { Notebook } from './storage/notebook';
import { pageKey, shortAddress } from './urls';

const notebook = new Notebook(AsyncStorage);
type Session = { id: string; url: string; revision: number; loaded: boolean; page: PageNotes | null };
export type SaveStatus = 'loading' | 'ready' | 'saving' | 'saved' | 'error';

export function useNotebook(browser: RefObject<BrowserHandle | null>, settings: InkSettings) {
  const active = useRef<Session | null>(null);
  const drafts = useRef(new Map<string, PageNotes>());
  const latestSettings = useRef(settings); latestSettings.current = settings;
  const mounted = useRef(true);
  const [pages, setPages] = useState<PageNotes[]>([]);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(false);
  const [strokeCount, setStrokeCount] = useState(0);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const onDocumentLoading = useCallback(() => {
    active.current = null;
    setStatus('loading'); setError(null); setLimit(false); setStrokeCount(0);
    setHistory({ canUndo: false, canRedo: false });
  }, []);

  useEffect(() => {
    mounted.current = true;
    void notebook.list().then((loaded) => {
      if (!mounted.current) return;
      setPages((current) => {
        const merged = new Map(loaded.map((p) => [p.url, p]));
        for (const p of current) merged.set(p.url, p);
        return [...merged.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
    }).catch(() => { if (mounted.current) setError('저장 목록을 불러오지 못했어요. 앱을 다시 열어 주세요.'); });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') browser.current?.send({ type: 'flush' }, active.current?.id);
    });
    return () => { mounted.current = false; subscription.remove(); };
  }, [browser]);

  useEffect(() => { browser.current?.send({ type: 'settings', settings }, active.current?.id); }, [settings, browser]);

  const persist = useCallback(async (session: Session, page: PageNotes) => {
    const revision = session.revision;
    drafts.current.set(page.url, page);
    setPages((current) => [page, ...current.filter((p) => p.url !== page.url)]
      .filter((p) => p.strokes.length > 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setStatus('saving'); setError(null);
    try {
      await notebook.save(page);
      if (drafts.current.get(page.url) === page) drafts.current.delete(page.url);
      if (mounted.current && active.current === session && session.revision === revision) setStatus('saved');
    } catch {
      if (mounted.current && active.current === session && session.revision === revision) {
        setStatus('error'); setError('필기를 저장하지 못했어요. 저장 공간을 확인하고 다시 저장해 주세요.');
      }
    }
  }, []);

  const onMessage = useCallback(async (raw: string, sourceUrl: string) => {
    const message = parseInkMessage(raw);
    if (!message) return;
    let url: string;
    try { url = pageKey(sourceUrl); } catch { return; }
    if (message.type === 'ready') {
      const session: Session = { id: message.documentId, url, revision: message.revision, loaded: false, page: null };
      active.current = session;
      setStatus('loading'); setError(null); setLimit(false); setStrokeCount(0);
      setHistory({ canUndo: false, canRedo: false });
      try {
        await notebook.settle();
        const page = drafts.current.get(url) ?? await notebook.read(url);
        if (!mounted.current || active.current !== session) return;
        session.page = page; session.loaded = true;
        setStrokeCount(page?.strokes.length ?? 0);
        browser.current?.send({ type: 'settings', settings: latestSettings.current }, session.id);
        browser.current?.send({ type: 'restore', strokes: page?.strokes ?? [] }, session.id);
        const unsaved = drafts.current.has(url);
        setStatus(unsaved ? 'error' : page?.strokes.length ? 'saved' : 'ready');
        if (unsaved) setError('아직 기기에 저장되지 않은 필기예요. 다시 저장해 주세요.');
      } catch {
        if (mounted.current && active.current === session) {
          setStatus('error'); setError('저장한 필기를 불러오지 못했어요. 새로고침해서 다시 시도해 주세요.');
        }
      }
      return;
    }
    const session = active.current;
    if (!session || session.id !== message.documentId || session.url !== url || !session.loaded) return;
    if (message.type === 'limit') { setLimit(true); return; }
    setHistory({ canUndo: message.canUndo, canRedo: message.canRedo });
    if (message.type === 'change' && message.strokes && message.revision > session.revision) {
      session.revision = message.revision;
      setLimit(false);
      const page: PageNotes = { version: 1, url, title: message.title || shortAddress(url),
        updatedAt: new Date().toISOString(), strokes: message.strokes };
      session.page = page;
      setStrokeCount(page.strokes.length);
      void persist(session, page);
    }
  }, [browser, persist]);

  const retrySave = () => {
    const session = active.current;
    if (session?.loaded && session.page) void persist(session, session.page);
    else browser.current?.reload();
  };

  return { pages, status, error, limit, strokeCount, history, onMessage, onDocumentLoading, retrySave };
}
