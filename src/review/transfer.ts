import { Stroke, validStrokes } from '../model';
import { canonicalReviewUrl } from './contract';

export const AUTHOR_ORIGIN = 'https://imjae-blog-author.imjae-game-dev-notes.workers.dev';
export type CaptureContext = {
  documentId: string; revision: number; url: string; title: string;
  sourceHash: string | null; currentSourceHash: string | null; visibleText: string; strokes: Stroke[];
  viewport: { x: number; y: number; width: number; height: number; scale: number };
};
export type Transfer = {
  version: 1; id: string; capturedAt: string; context: CaptureContext;
  image: string; instruction: string;
  reanchored?: boolean;
};

export function parseCapture(raw: string, nonce: string, url: string): CaptureContext | null {
  if (raw.length > 2_000_000) return null;
  try {
    const value = JSON.parse(raw);
    if (value.channel !== 'sketch-review' || value.nonce !== nonce) return null;
    if (value.error) throw new Error(value.error);
    const c = value.context;
    if (!c || canonicalReviewUrl(c.url) !== canonicalReviewUrl(url) ||
      typeof c.documentId !== 'string' || c.documentId.length > 100 || !Number.isSafeInteger(c.revision) || c.revision < 0 ||
      typeof c.title !== 'string' || c.title.length > 300 || typeof c.visibleText !== 'string' || !c.visibleText.trim() || c.visibleText.length > 16000 ||
      !(c.sourceHash === null || /^[a-f0-9]{64}$/.test(c.sourceHash)) || !validStrokes(c.strokes) || !c.strokes.length) return null;
    if (!(c.currentSourceHash === null || /^[a-f0-9]{64}$/.test(c.currentSourceHash))) return null;
    if (!c.viewport || !['x', 'y', 'width', 'height', 'scale'].every(k => typeof c.viewport[k] === 'number' && Number.isFinite(c.viewport[k]) && c.viewport[k] >= 0 && c.viewport[k] < 10_000_000)) return null;
    return c;
  } catch { return null; }
}

// Inject only into the authenticated, exact-origin /sketch/ page.
export function transferScript(transfer: Transfer): string {
  const data = JSON.stringify(transfer).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `if (location.origin === ${JSON.stringify(AUTHOR_ORIGIN)} && location.pathname === '/sketch/') { window.receiveSketchCapture?.(${data}); } true;`;
}
