import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_POINTS, PageNotes, Stroke, parseInkMessage, validStrokes } from '../src/model';
import { HOME_URL, pageKey, resolveAddress } from '../src/urls';
import { KeyValueStorage, Notebook } from '../src/storage/notebook';

const stroke: Stroke = { id: 'ink-1', tool: 'pen', color: '#315de8', width: 3, anchor: null,
  points: [{ x: 12, y: 60, pressure: 0.5 }, { x: 30, y: 70, pressure: 0.8 }] };
const page = (url = 'https://example.com/', strokes = [stroke]): PageNotes => ({
  version: 1, url, title: 'A page', updatedAt: '2026-10-24T10:00:00.000Z', strokes,
});

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async getAllKeys() { return [...this.values.keys()]; }
}

test('addresses distinguish HTTPS URLs, searches and unsupported schemes', () => {
  assert.equal(resolveAddress(' example.com/article '), 'https://example.com/article');
  assert.equal(resolveAddress('https://example.com/a?q=2'), 'https://example.com/a?q=2');
  assert.equal(resolveAddress('example.com:8443/a'), 'https://example.com:8443/a');
  assert.equal(resolveAddress('스케치 브라우저'), 'https://duckduckgo.com/?q=%EC%8A%A4%EC%BC%80%EC%B9%98%20%EB%B8%8C%EB%9D%BC%EC%9A%B0%EC%A0%80');
  assert.equal(resolveAddress(''), HOME_URL);
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hello', 'intent://app']) {
    assert.throws(() => resolveAddress(url));
  }
});

test('section links share notes, but query strings and SPA hash routes remain distinct', () => {
  assert.equal(pageKey('https://EXAMPLE.com:443/article#section2'), 'https://example.com/article');
  assert.notEqual(pageKey('https://example.com/?id=1'), pageKey('https://example.com/?id=2'));
  assert.notEqual(pageKey('https://example.com/#/a'), pageKey('https://example.com/#/b'));
  assert.notEqual(pageKey('https://example.com/#!/a'), pageKey('https://example.com/#!/b'));
});

test('the WebView bridge rejects malformed or excessive data', () => {
  const message = { channel: 'sketch-browser', type: 'change', documentId: 'doc-1', title: 'Test', revision: 1,
    canUndo: true, canRedo: false, strokes: [stroke] };
  assert.ok(parseInkMessage(JSON.stringify(message)));
  assert.equal(parseInkMessage('not json'), null);
  assert.equal(parseInkMessage(JSON.stringify({ ...message, strokes: [{ ...stroke, color: 'url(evil)' }] })), null);
  assert.equal(parseInkMessage(JSON.stringify({ ...message, revision: -1 })), null);
  assert.equal(parseInkMessage(JSON.stringify({ ...message, strokes: [{ ...stroke, points: [{ x: null, y: 2, pressure: 0.5 }] }] })), null);
  assert.equal(validStrokes([{ ...stroke, points: Array(MAX_POINTS + 1).fill(stroke.points[0]) }]), false);
  assert.equal(validStrokes([{ ...stroke, anchor: { selector: '#p', text: 'Paragraph', x: 0, y: 30, width: 300 } }]), true);
});

test('notes persist across repository instances and stay isolated by page', async () => {
  const storage = new MemoryStorage();
  const notebook = new Notebook(storage);
  await notebook.save(page());
  await notebook.save({ ...page('https://example.com/second'), title: 'Second page', updatedAt: '2026-10-24T11:00:00.000Z' });
  const reopened = new Notebook(storage);
  assert.deepEqual((await reopened.read('https://example.com/#anchor'))?.strokes, [stroke]);
  assert.equal((await reopened.list())[0].title, 'Second page');
  assert.equal(await reopened.read('https://example.com/third'), null);
});

test('rapid writes are serialized and capture immutable snapshots', async () => {
  const storage = new MemoryStorage();
  const notebook = new Notebook(storage);
  const first = page();
  const saved = notebook.save(first);
  first.strokes = [];
  await saved;
  assert.equal((await notebook.read(first.url))?.strokes.length, 1);
  await Promise.all([notebook.save(page()), notebook.save(page('https://example.com/', []))]);
  assert.equal((await notebook.read(first.url))?.strokes.length, 0);
  assert.equal((await notebook.list()).length, 0);
});

test('a failed write can be retried without poisoning the save queue', async () => {
  const storage = new MemoryStorage();
  let fail = true;
  storage.setItem = async (key, value) => { if (fail) { fail = false; throw new Error('disk full'); } storage.values.set(key, value); };
  const notebook = new Notebook(storage);
  await assert.rejects(notebook.save(page()), /disk full/);
  await notebook.save(page());
  assert.equal((await notebook.read(page().url))?.strokes.length, 1);
});

test('a corrupt record does not hide other saved pages', async () => {
  const storage = new MemoryStorage();
  const notebook = new Notebook(storage);
  await notebook.save(page());
  storage.values.set('@sketch-browser/page/v1/' + encodeURIComponent('https://broken.test/'), '{invalid');
  assert.equal((await notebook.list()).length, 1);
  await assert.rejects(notebook.read('https://broken.test/'));
});
