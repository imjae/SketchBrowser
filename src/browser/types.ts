import { InkCommand } from '../model';

export type BrowserHandle = {
  send(command: InkCommand, documentId?: string): void;
  back(): void;
  forward(): void;
  reload(): void;
};
export type Navigation = { url: string; canGoBack: boolean; canGoForward: boolean; loading: boolean };
export type BrowserProps = {
  url: string;
  requestId: number;
  onMessage(raw: string, url: string): void;
  onNavigation(state: Navigation): void;
  onDocumentLoading(): void;
  onError(message: string | null): void;
};
