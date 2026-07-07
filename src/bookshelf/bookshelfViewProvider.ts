import * as vscode from 'vscode';
import { BookRecord } from '../types';
import { BookshelfStore } from '../storage/bookshelfStore';
import { ReaderSession } from '../reader/readerManager';

function progressPercent(book: BookRecord): number {
  const p = book.progress;
  if (p.type === 'txt') {
    return Math.round((p.scrollPercent ?? 0) * 100);
  }
  if (typeof p.overallPercent === 'number') {
    return Math.round(p.overallPercent * 100);
  }
  return Math.round((p.scrollPercent ?? 0) * 100);
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let n = '';
  for (let i = 0; i < 32; i++) {
    n += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return n;
}

export function getPanelHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const shelfStyle = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'bookshelf', 'bookshelf.css')
  );
  const readerStyle = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'reader', 'reader.css')
  );
  const shelfScript = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'bookshelf', 'bookshelf.js')
  );
  const readerScript = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'reader', 'reader.js')
  );
  const jszipUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'lib', 'jszip.min.js')
  );
  const epubUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'lib', 'epub.min.js')
  );
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; connect-src ${webview.cspSource} blob: data:; frame-src ${webview.cspSource} blob:;" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${shelfStyle}" />
  <link rel="stylesheet" href="${readerStyle}" />
  <title>BookNook</title>
</head>
<body>
  <div id="shelf-ui" class="shelf-ui">
    <header class="shelf-header">
      <h1 class="shelf-title">书架</h1>
    </header>
    <main id="shelf-grid" class="shelf-grid"></main>
    <div id="shelf-empty" class="shelf-empty hidden">
      <p>暂无书籍</p>
      <button id="btn-empty-import" type="button" class="shelf-btn-primary">导入书籍</button>
    </div>
    <div class="shelf-fab-group">
      <button id="btn-refresh" class="shelf-fab" type="button" title="刷新">↻</button>
      <button id="btn-import" class="shelf-fab shelf-fab-primary" type="button" title="导入">+</button>
    </div>
  </div>

  <div id="reader-root" class="reader-root hidden">
    <header id="chrome-top" class="chrome-top">
      <button id="btn-home" class="icon-btn icon-back" type="button" title="返回" aria-label="返回">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 3.5L5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="toolbar-actions">
        <button id="btn-toc" class="action-btn" type="button" title="目录 (T)" disabled>☰ 目录</button>
        <button id="btn-find" class="action-btn" type="button" title="全文搜索 (Ctrl+F)">⌕ 搜索</button>
        <button id="btn-help" class="action-btn action-btn-icon" type="button" title="快捷键">?</button>
      </div>
    </header>
    <main id="reader-shell">
      <div id="txt-reader" class="reader-pane hidden">
        <article id="txt-content" class="reader-content"></article>
      </div>
      <div id="epub-view" class="reader-pane hidden"></div>
      <div id="status" class="status-overlay hidden">
        <div class="status-spinner" aria-hidden="true"></div>
        <span id="status-text"></span>
      </div>
    </main>
    <footer id="chrome-bottom" class="chrome-bottom">
      <div class="progress-track" aria-hidden="true"><div id="progress-fill" class="progress-fill"></div></div>
      <div class="footer-bar">
        <button id="btn-prev" class="action-lg" type="button" title="上一章 [←]" disabled>上一章</button>
        <button id="btn-page-up" class="action-lg" type="button" title="上页 [PgUp]">上页</button>
        <span id="progress-text" class="progress-label">0%</span>
        <button id="btn-page-down" class="action-lg" type="button" title="下页 [PgDn]">下页</button>
        <button id="btn-next" class="action-lg" type="button" title="下一章 [→]" disabled>下一章</button>
      </div>
    </footer>
    <div id="search-overlay" class="panel-overlay hidden" role="dialog" aria-modal="true" aria-label="全文搜索">
      <div class="panel-backdrop" data-close="search"></div>
      <div class="panel-sheet panel-sheet-top">
        <div class="panel-header">
          <span class="panel-title">全文搜索</span>
          <button class="icon-btn panel-close" type="button" data-close="search" aria-label="关闭">×</button>
        </div>
        <div class="search-bar">
          <input id="find-input" class="search-input" type="search" placeholder="输入关键词…" autocomplete="off" />
          <span id="find-count" class="find-count"></span>
        </div>
        <div class="search-nav">
          <button id="find-prev" class="action-btn" type="button" disabled>上一个</button>
          <button id="find-next" class="action-btn" type="button" disabled>下一个</button>
        </div>
        <div id="find-results" class="find-results"></div>
      </div>
    </div>
    <div id="help-overlay" class="panel-overlay hidden" role="dialog" aria-modal="true" aria-label="快捷键">
      <div class="panel-backdrop" data-close="help"></div>
      <div class="panel-sheet">
        <div class="panel-header">
          <span class="panel-title">快捷键</span>
          <button class="icon-btn panel-close" type="button" data-close="help" aria-label="关闭">×</button>
        </div>
        <div class="shortcut-list">
          <div class="shortcut-row"><kbd>←</kbd><kbd>→</kbd><span>上一章 / 下一章</span></div>
          <div class="shortcut-row"><kbd>PgUp</kbd><kbd>PgDn</kbd><span>上页 / 下页</span></div>
          <div class="shortcut-row"><kbd>Space</kbd><span>下页</span></div>
          <div class="shortcut-row"><kbd>Shift</kbd><kbd>Space</kbd><span>上页</span></div>
          <div class="shortcut-row"><kbd>T</kbd><span>打开目录</span></div>
          <div class="shortcut-row"><kbd>Ctrl</kbd><kbd>F</kbd><span>全文搜索</span></div>
          <div class="shortcut-row"><kbd>Esc</kbd><span>关闭面板</span></div>
        </div>
      </div>
    </div>
    <div id="chapter-overlay" class="panel-overlay hidden" role="dialog" aria-modal="true" aria-label="目录">
      <div class="panel-backdrop" data-close="chapter"></div>
      <div class="panel-sheet">
        <div class="panel-header">
          <span class="panel-title">目录 <span id="chapter-label" class="chapter-current"></span></span>
          <button id="chapter-close" class="icon-btn panel-close" type="button" aria-label="关闭">×</button>
        </div>
        <div id="chapter-search-wrap" class="chapter-search-wrap hidden">
          <input id="chapter-search" class="chapter-search" type="search" placeholder="搜索章节…" />
        </div>
        <div id="chapter-list" class="chapter-list"></div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${jszipUri}"></script>
  <script nonce="${nonce}" src="${epubUri}"></script>
  <script nonce="${nonce}" src="${shelfScript}"></script>
  <script nonce="${nonce}" src="${readerScript}"></script>
</body>
</html>`;
}

export interface BookshelfBookItem {
  id: string;
  title: string;
  author?: string;
  format: string;
  coverDataUrl?: string;
  coverLoading?: boolean;
  progressPercent: number;
}

export type BookshelfWebviewMessage =
  | { type: 'shelfReady' }
  | { type: 'open'; bookId: string }
  | { type: 'remove'; bookId: string }
  | { type: 'import' }
  | { type: 'refresh' };

export class BookshelfViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private session?: ReaderSession;
  private webviewReady = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: BookshelfStore
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    this.webviewReady = false;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.file(this.store.getBooksRoot())
      ]
    };
    webviewView.webview.html = getPanelHtml(webviewView.webview, this.extensionUri);

    this.session = new ReaderSession(
      this.store,
      this.extensionUri,
      () => this.view?.webview,
      () => {
        void vscode.commands.executeCommand('booknook.bookshelf.focus');
      },
      () => void this.goHome()
    );
    this.session.bindWebview(webviewView.webview, { skipHtml: true });

    webviewView.webview.onDidReceiveMessage((msg: BookshelfWebviewMessage) => {
      if (msg.type === 'shelfReady') {
        this.webviewReady = true;
        void this.pushBooks();
        return;
      }
      if (msg.type === 'open') {
        void this.openBook(msg.bookId);
      } else if (msg.type === 'remove') {
        void this.confirmRemove(msg.bookId);
      } else if (msg.type === 'import') {
        void vscode.commands.executeCommand('booknook.importBook');
      } else if (msg.type === 'refresh') {
        void this.pushBooks();
      }
    });

    webviewView.onDidDispose(() => {
      this.session?.dispose();
      this.session = undefined;
      this.view = undefined;
      this.webviewReady = false;
    });
  }

  async openBook(bookId: string): Promise<void> {
    const book = this.store.getBook(bookId);
    if (!book) {
      vscode.window.showWarningMessage('书籍不存在或已被移除');
      return;
    }

    const webview = this.view?.webview;
    if (!this.session || !webview) {
      vscode.window.showWarningMessage('面板尚未就绪，请稍后再试');
      return;
    }

    if (this.view) {
      this.view.title = book.title;
      this.view.description = book.author;
    }
    await webview.postMessage({ type: 'showReader' });

    const ok = await this.session.openBook(bookId);
    if (!ok) {
      await this.goHome();
    }
  }

  async goHome(): Promise<void> {
    const webview = this.view?.webview;
    if (this.view) {
      this.view.title = 'BookNook';
      this.view.description = undefined;
    }
    if (webview) {
      await webview.postMessage({ type: 'showShelf' });
      await this.patchBooks();
    }
    void vscode.commands.executeCommand('booknook.bookshelf.focus');
  }

  async refresh(): Promise<void> {
    await this.pushBooks();
  }

  notifyThemeChange(): void {
    this.session?.notifyThemeChange();
  }

  reloadSettings(): void {
    void this.session?.reloadSettings();
  }

  private async pushBooks(): Promise<void> {
    const webview = this.view?.webview;
    if (!webview) {
      return;
    }
    await this.waitForReady();

    const records = this.store.getBooks();
    const books: BookshelfBookItem[] = records.map((b) => ({
      id: b.id,
      title: b.title,
      author: b.author,
      format: b.format,
      progressPercent: progressPercent(b)
    }));

    await webview.postMessage({ type: 'update', books });

    for (const book of records) {
      if (!book.coverDataUrl) {
        continue;
      }
      await webview.postMessage({
        type: 'patchCover',
        bookId: book.id,
        coverDataUrl: book.coverDataUrl
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  private async patchBooks(): Promise<void> {
    const webview = this.view?.webview;
    if (!webview) {
      return;
    }
    const books = this.store.getBooks().map((b) => ({
      id: b.id,
      progressPercent: progressPercent(b)
    }));
    await webview.postMessage({ type: 'patchBooks', books });
  }

  private waitForReady(timeoutMs = 5000): Promise<void> {
    if (this.webviewReady) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (this.webviewReady) {
          resolve();
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve();
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  private async confirmRemove(bookId: string): Promise<void> {
    const book = this.store.getBook(bookId);
    if (!book) {
      return;
    }
    const ok = await vscode.window.showWarningMessage(
      `确定从书架移除「${book.title}」？`,
      { modal: true },
      '移除'
    );
    if (ok === '移除') {
      await this.store.removeBook(bookId);
      await this.pushBooks();
    }
  }
}
