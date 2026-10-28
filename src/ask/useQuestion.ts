import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { randomUUID } from 'expo-crypto';
import { BrowserHandle } from '../browser/types';
import { parseInkMessage } from '../model';
import { pageKey } from '../urls';
import { QuestionImage, QuestionSelection, parseQuestionMessage } from './protocol';

export function useQuestion(browser: RefObject<BrowserHandle | null>) {
  const document = useRef<{id:string;url:string}|null>(null);
  const pending = useRef<AbortController|null>(null);
  const [selection, setSelection] = useState<QuestionSelection|null>(null);
  const [notice, setNotice] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [panel, setPanel] = useState<{image:QuestionImage|null;error:string;anchor:QuestionSelection['bounds']}|null>(null);
  const close = useCallback(() => {
    pending.current?.abort(); pending.current=null;
    setCapturing(false); setPanel(null); setSelection(null); setNotice('');
    browser.current?.send({type:'questionClear'});
  }, [browser]);
  const loading = useCallback(() => { document.current=null; close(); }, [close]);
  useEffect(() => () => { pending.current?.abort(); pending.current=null; }, []);
  const onMessage = useCallback((raw:string,url:string) => {
    try { url=pageKey(url); } catch { return; }
    const ink=parseInkMessage(raw);
    if(ink?.type==='ready') {
      close(); document.current={id:ink.documentId,url}; return;
    }
    const m=parseQuestionMessage(raw);
    if(!m || document.current?.id!==m.documentId || document.current.url!==url)return;
    setSelection(m.selection); setNotice(m.notice||'');
  }, [close]);
  const ask = async () => {
    if(!selection || panel || pending.current || !browser.current)return;
    const controller=new AbortController(); pending.current=controller;
    setCapturing(true); setNotice('');
    try {
      const image=await browser.current.captureQuestion(selection.id,controller.signal);
      if(controller.signal.aborted || pending.current!==controller)return;
      setPanel({image:{id:randomUUID(),image},error:'',anchor:selection.bounds});
      browser.current?.send({type:'questionClear'});
    } catch(e) {
      if(!controller.signal.aborted && pending.current===controller) setPanel({image:null,error:(e as Error).message||'영역을 준비하지 못했어요.',anchor:selection.bounds});
    } finally {
      if(pending.current===controller){pending.current=null;setCapturing(false);}
    }
  };
  return {selection,notice,capturing,panel,ask,close,loading,onMessage};
}
