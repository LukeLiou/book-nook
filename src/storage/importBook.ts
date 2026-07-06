import * as fs from 'fs';
import * as path from 'path';
import * as iconv from 'iconv-lite';
import jschardet from 'jschardet';
import {
  BookFormat,
  BookRecord,
  DEFAULT_EPUB_PROGRESS,
  DEFAULT_TXT_PROGRESS
} from '../types';
import { BookshelfStore } from './bookshelfStore';
import { parseEpubMeta } from './epubMeta';

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function detectFormat(filePath: string): BookFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.epub') {
    return 'epub';
  }
  if (ext === '.txt') {
    return 'txt';
  }
  return undefined;
}

async function decodeTxt(filePath: string): Promise<string> {
  const buffer = await fs.promises.readFile(filePath);
  const detected = jschardet.detect(buffer);
  const encoding = detected?.encoding?.toLowerCase() || 'utf-8';
  const normalized =
    encoding === 'ascii' || encoding === 'utf-8' ? 'utf-8' : encoding;
  try {
    return iconv.decode(buffer, normalized);
  } catch {
    return iconv.decode(buffer, 'utf-8');
  }
}

function titleFromTxtFileName(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

export async function importBookFromFile(
  store: BookshelfStore,
  sourcePath: string
): Promise<BookRecord> {
  const format = detectFormat(sourcePath);
  if (!format) {
    throw new Error('仅支持 .epub 与 .txt 文件');
  }

  const id = randomId();
  const dir = store.bookStorageDir(id);
  await fs.promises.mkdir(dir, { recursive: true });

  const originalName = path.basename(sourcePath);
  const destFileName = format === 'epub' ? 'book.epub' : 'book.txt';
  const destPath = path.join(dir, destFileName);
  await fs.promises.copyFile(sourcePath, destPath);

  let title = originalName;
  let author: string | undefined;
  let coverDataUrl: string | undefined;

  if (format === 'epub') {
    const meta = await parseEpubMeta(destPath);
    title = meta.title;
    author = meta.author;
    coverDataUrl = meta.coverDataUrl;
  } else {
    title = titleFromTxtFileName(sourcePath);
    // 预读以验证编码可读
    await decodeTxt(destPath);
  }

  const book: BookRecord = {
    id,
    title,
    author,
    format,
    storagePath: path.posix.join('books', id, destFileName),
    originalName,
    coverDataUrl,
    addedAt: Date.now(),
    progress: format === 'epub' ? { ...DEFAULT_EPUB_PROGRESS } : { ...DEFAULT_TXT_PROGRESS }
  };

  await store.addBook(book);
  return book;
}

export async function readTxtContent(store: BookshelfStore, book: BookRecord): Promise<string> {
  const abs = store.getAbsolutePath(book);
  return decodeTxt(abs);
}
