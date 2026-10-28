export type Tool = 'browse' | 'pen' | 'underline' | 'highlighter' | 'eraser' | 'question';
export type InkSettings = { tool: Tool; color: string; width: number; penOnly: boolean };
export type Point = { x: number; y: number; pressure: number };
export type Anchor = {
  selector: string;
  text: string;
  x: number;
  y: number;
  width: number;
};
export type Stroke = {
  id: string;
  tool: 'pen' | 'underline' | 'highlighter';
  color: string;
  width: number;
  points: Point[];
  anchor: Anchor | null;
};
export type PageNotes = {
  version: 1;
  url: string;
  title: string;
  updatedAt: string;
  strokes: Stroke[];
  sourceHash?: string | null;
};
export type InkMessage = {
  channel: 'sketch-browser';
  type: 'ready' | 'change' | 'state' | 'limit' | 'browse' | 'pen' | 'penButton';
  documentId: string;
  title: string;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  strokes?: Stroke[];
  pressed?: boolean;
  sourceHash?: string | null;
};
export type InkCommand =
  | { type: 'restore'; strokes: Stroke[]; sourceHash?: string | null }
  | { type: 'settings'; settings: InkSettings }
  | { type: 'capture' | 'captureCheck' | 'captureRelease'; nonce: string }
  | { type: 'questionClear' }
  | { type: 'questionCapture'; nonce: string; selectionId: string }
  | { type: 'questionMask'; nonce: string; image: string }
  | { type: 'questionRelease'; nonce: string }
  | { type: 'undo' | 'redo' | 'flush' };

export const DEFAULT_SETTINGS: InkSettings = { tool: 'browse', color: '#315de8', width: 3, penOnly: false };
export const MAX_POINTS = 24_000;
export const MAX_STROKES = 600;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 10_000_000;

// Web pages can call the native bridge: accept only bounded annotation data.
export function validStrokes(value: unknown): value is Stroke[] {
  if (!Array.isArray(value) || value.length > MAX_STROKES) return false;
  let pointCount = 0;
  return value.every((s) => {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string' || s.id.length > 100 ||
      !['pen', 'underline', 'highlighter'].includes(s.tool) || !/^#[0-9a-f]{6}$/i.test(s.color) ||
      !finite(s.width) || s.width < 1 || s.width > 24 || !Array.isArray(s.points) || !s.points.length) return false;
    pointCount += s.points.length;
    if (pointCount > MAX_POINTS || !s.points.every((p: Point) => p && finite(p.x) && finite(p.y) && finite(p.pressure) && p.pressure >= 0 && p.pressure <= 1)) return false;
    const a = s.anchor;
    return a === null || (!!a && typeof a.selector === 'string' && a.selector.length <= 1500 &&
      typeof a.text === 'string' && a.text.length <= 80 && finite(a.x) && finite(a.y) && finite(a.width) && a.width > 0);
  });
}

export function parseInkMessage(raw: string): InkMessage | null {
  if (raw.length > 1_800_000) return null;
  try {
    const m = JSON.parse(raw);
    if (m?.channel !== 'sketch-browser' || !['ready', 'change', 'state', 'limit', 'browse', 'pen', 'penButton'].includes(m.type) ||
      typeof m.documentId !== 'string' || m.documentId.length > 100 || typeof m.title !== 'string' || m.title.length > 300 ||
      !Number.isSafeInteger(m.revision) || m.revision < 0 || typeof m.canUndo !== 'boolean' || typeof m.canRedo !== 'boolean') return null;
    if (m.type === 'change' && !validStrokes(m.strokes)) return null;
    if (m.sourceHash !== undefined && m.sourceHash !== null && !/^[a-f0-9]{64}$/.test(m.sourceHash)) return null;
    if (m.type === 'penButton' && typeof m.pressed !== 'boolean') return null;
    return m as InkMessage;
  } catch { return null; }
}
