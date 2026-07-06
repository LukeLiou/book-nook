import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { BookRecord, BookshelfData } from '../types';

const DATA_FILE = 'bookshelf.json';
const BOOKS_DIR = 'books';

export class BookshelfStore {
  private data: BookshelfData = { version: 1, books: [] };
  private dataPath: string;
  private booksRoot: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    const root = context.globalStorageUri.fsPath;
    this.dataPath = path.join(root, DATA_FILE);
    this.booksRoot = path.join(root, BOOKS_DIR);
  }

  async initialize(): Promise<void> {
    await fs.promises.mkdir(this.booksRoot, { recursive: true });
    this.data = await this.load();
  }

  getBooks(): BookRecord[] {
    return [...this.data.books].sort((a, b) => {
      const ta = a.lastReadAt ?? a.addedAt;
      const tb = b.lastReadAt ?? b.addedAt;
      return tb - ta;
    });
  }

  getBook(id: string): BookRecord | undefined {
    return this.data.books.find((b) => b.id === id);
  }

  getAbsolutePath(record: BookRecord): string {
    return path.join(this.context.globalStorageUri.fsPath, record.storagePath);
  }

  getBooksRoot(): string {
    return this.booksRoot;
  }

  async addBook(book: BookRecord): Promise<void> {
    this.data.books.push(book);
    await this.persist();
  }

  async updateBook(id: string, patch: Partial<BookRecord>): Promise<void> {
    const idx = this.data.books.findIndex((b) => b.id === id);
    if (idx < 0) {
      return;
    }
    this.data.books[idx] = { ...this.data.books[idx], ...patch };
    await this.persist();
  }

  async updateProgress(id: string, progress: BookRecord['progress']): Promise<void> {
    await this.updateBook(id, {
      progress,
      lastReadAt: Date.now()
    });
  }

  async removeBook(id: string): Promise<void> {
    const book = this.getBook(id);
    if (!book) {
      return;
    }
    this.data.books = this.data.books.filter((b) => b.id !== id);
    await this.persist();
    const dir = path.dirname(this.getAbsolutePath(book));
    await fs.promises.rm(dir, { recursive: true, force: true });
  }

  bookStorageDir(id: string): string {
    return path.join(this.booksRoot, id);
  }

  private async load(): Promise<BookshelfData> {
    try {
      const raw = await fs.promises.readFile(this.dataPath, 'utf8');
      const parsed = JSON.parse(raw) as BookshelfData;
      if (parsed.version === 1 && Array.isArray(parsed.books)) {
        return parsed;
      }
    } catch {
      // 首次使用或文件损坏时重建
    }
    return { version: 1, books: [] };
  }

  private async persist(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.dataPath), { recursive: true });
    await fs.promises.writeFile(this.dataPath, JSON.stringify(this.data, null, 2), 'utf8');
  }
}
