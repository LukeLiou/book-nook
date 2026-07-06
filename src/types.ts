export type BookFormat = 'epub' | 'txt';

export type ReaderLocation = 'sidebar' | 'editor';

export interface EpubProgress {
  type: 'epub';
  spineIndex: number;
  scrollPercent: number;
  chapterHref?: string;
}

export interface TxtProgress {
  type: 'txt';
  scrollPercent: number;
}

export type ReadingProgress = EpubProgress | TxtProgress;

export interface BookRecord {
  id: string;
  title: string;
  author?: string;
  format: BookFormat;
  /** 复制到扩展目录后的相对路径，如 books/{id}/book.epub */
  storagePath: string;
  originalName: string;
  coverDataUrl?: string;
  addedAt: number;
  lastReadAt?: number;
  progress: ReadingProgress;
}

export interface BookshelfData {
  version: 1;
  books: BookRecord[];
}

export const DEFAULT_EPUB_PROGRESS: EpubProgress = {
  type: 'epub',
  spineIndex: 0,
  scrollPercent: 0
};

export const DEFAULT_TXT_PROGRESS: TxtProgress = {
  type: 'txt',
  scrollPercent: 0
};

export interface ReaderStatePayload {
  bookId: string;
  title: string;
  format: BookFormat;
  fontSize: number;
  lineHeight: number;
  progress: ReadingProgress;
  /** EPUB: webview 可访问的文件 URI */
  bookUri?: string;
  /** TXT: 已解码的正文 */
  textContent?: string;
}

export type WebviewToHostMessage =
  | { type: 'ready' }
  | { type: 'progress'; bookId: string; progress: ReadingProgress }
  | { type: 'openToc' }
  | { type: 'error'; message: string };

export type HostToWebviewMessage =
  | { type: 'load'; payload: ReaderStatePayload }
  | { type: 'updateSettings'; fontSize: number; lineHeight: number };
