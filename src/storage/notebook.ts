import { PageNotes, validStrokes } from '../model';
import { pageKey } from '../urls';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}
const PREFIX = '@sketch-browser/page/v1/';

export class Notebook {
  private pending: Promise<void> = Promise.resolve();
  constructor(private storage: KeyValueStorage) {}

  private key(url: string) { return PREFIX + encodeURIComponent(pageKey(url)); }

  async settle(): Promise<void> { await this.pending.catch(() => undefined); }

  async read(url: string): Promise<PageNotes | null> {
    await this.pending.catch(() => undefined);
    const raw = await this.storage.getItem(this.key(url));
    if (!raw) return null;
    const page = JSON.parse(raw) as PageNotes;
    if (page.version !== 1 || page.url !== pageKey(url) || typeof page.title !== 'string' ||
      !Number.isFinite(Date.parse(page.updatedAt)) || !validStrokes(page.strokes)) {
      throw new Error('저장한 필기를 읽지 못했습니다.');
    }
    return page;
  }

  save(page: PageNotes): Promise<void> {
    if (!validStrokes(page.strokes)) return Promise.reject(new Error('필기 데이터가 너무 크거나 올바르지 않습니다.'));
    const key = this.key(page.url);
    const snapshot = JSON.stringify({ ...page, url: pageKey(page.url) });
    // Serialize writes so an older, slower save can never replace newer ink.
    const task = this.pending.catch(() => undefined).then(() => this.storage.setItem(key, snapshot));
    this.pending = task;
    return task;
  }

  async list(): Promise<PageNotes[]> {
    await this.pending.catch(() => undefined);
    const keys = (await this.storage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
    const pages = await Promise.all(keys.map(async (key) => {
      // Isolate a corrupt page without making all other notes inaccessible.
      try { return await this.read(decodeURIComponent(key.slice(PREFIX.length))); }
      catch { return null; }
    }));
    return pages.filter((page): page is PageNotes => !!page && page.strokes.length > 0)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
}
