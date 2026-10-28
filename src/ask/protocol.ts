import { AUTHOR_ORIGIN } from '../review/transfer';

export const QUESTION_PATH = '/sketch/ask/';
export type QuestionSelection = {
  id: string;
  documentId: string;
  bounds: { x: number; y: number; width: number; height: number };
};
export type QuestionImage = { id: string; image: string };
export type QuestionMessage = {
  channel: 'sketch-question'; documentId: string;
  selection: QuestionSelection | null; notice?: string;
};

export function isQuestionPage(value: string): boolean {
  try { const url = new URL(value); return url.origin === AUTHOR_ORIGIN && url.pathname === QUESTION_PATH; }
  catch { return false; }
}

export function parseQuestionPanelMessage(raw: string, source: string): {type:'sketch-question-ready'} | {type:'sketch-question-received';id:string} | null {
  if(raw.length>1000)return null;
  try {
    const url=new URL(source);
    // Android WebMessageListener reports only sourceOrigin; legacy/iOS reports
    // the full page URL. Injection separately checks the exact live page path.
    if(url.origin!==AUTHOR_ORIGIN || !['/',QUESTION_PATH].includes(url.pathname))return null;
    const message=JSON.parse(raw);
    if(message.type==='sketch-question-ready')return {type:message.type};
    if(message.type==='sketch-question-received' && typeof message.id==='string' && /^[0-9a-f-]{36}$/i.test(message.id))return {type:message.type,id:message.id};
  }catch{}
  return null;
}

export function parseQuestionMessage(raw: string): QuestionMessage | null {
  if (raw.length > 3000) return null;
  try {
    const m = JSON.parse(raw);
    if (m.channel !== 'sketch-question' || typeof m.documentId !== 'string' || m.documentId.length > 100 ||
      (m.notice !== undefined && (typeof m.notice !== 'string' || m.notice.length > 200))) return null;
    const s = m.selection;
    if (s !== null) {
      if (!s || typeof s.id !== 'string' || s.id.length > 100 || s.documentId !== m.documentId || !s.bounds) return null;
      const b = s.bounds;
      if (!['x', 'y', 'width', 'height'].every(k => Number.isFinite(b[k]) && b[k] >= 0 && b[k] <= 1) ||
        b.width <= 0 || b.height <= 0 || b.x + b.width > 1.001 || b.y + b.height > 1.001) return null;
    }
    return m;
  } catch { return null; }
}

export function questionTransferScript(value: QuestionImage): string {
  const data = JSON.stringify(value).replace(/</g, '\\u003c');
  return `if(location.origin===${JSON.stringify(AUTHOR_ORIGIN)}&&location.pathname===${JSON.stringify(QUESTION_PATH)})window.receiveSketchQuestion?.(${data});true;`;
}
