import * as fs from 'fs';
import * as vscode from 'vscode';
import { BookRecord, HostToWebviewMessage, ReaderLocation, ReaderStatePayload, WebviewToHostMessage } from '../types';
import { BookshelfStore } from '../storage/bookshelfStore';
import { readTxtContent } from '../storage/importBook';

function getReaderConfig(): { fontSize: number; lineHeight: number; location: ReaderLocation } {
  const cfg = vscode.workspace.getConfiguration('booknook');
  return {
    fontSize: cfg.get<number>('fontSize', 16),
    lineHeight: cfg.get<number>('lineHeight', 1.8),
    location: cfg.get<ReaderLocation>('readerLocation', 'sidebar')
  };
}

export function getReaderHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media', 'reader');
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'reader.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'reader.css'));
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
  <link rel="stylesheet" href="${styleUri}" />
  <title>BookNook</title>
</head>
<body>
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
    <div class="progress-track" aria-hidden="true">
      <div id="progress-fill" class="progress-fill"></div>
    </div>
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
        <div class="shortcut-row"><kbd>Enter</kbd><span>下一个匹配</span></div>
        <div class="shortcut-row"><kbd>Shift</kbd><kbd>Enter</kbd><span>上一个匹配</span></div>
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
  <script nonce="${nonce}" src="${jszipUri}"></script>
  <script nonce="${nonce}" src="${epubUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let n = '';
  for (let i = 0; i < 32; i++) {
    n += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return n;
}

export class ReaderSession {
  private disposables: vscode.Disposable[] = [];
  private progressTimer: ReturnType<typeof setTimeout> | undefined;
  private currentBookId: string | undefined;
  private webviewReady = false;
  private readyWaiters: Array<() => void> = [];

  constructor(
    private readonly store: BookshelfStore,
    private readonly extensionUri: vscode.Uri,
    private readonly getWebview: () => vscode.Webview | undefined,
    private readonly reveal: () => void,
    private readonly onGoHome?: () => void
  ) {}

  dispose(): void {
    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  bindWebview(webview: vscode.Webview, options?: { skipHtml?: boolean }): void {
    this.dispose();
    this.webviewReady = false;
    this.readyWaiters = [];
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media'),
        vscode.Uri.file(this.store.getBooksRoot())
      ]
    };

    if (!options?.skipHtml) {
      webview.html = getReaderHtml(webview, this.extensionUri);
    }

    this.disposables.push(
      webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
        if (msg.type === 'ready') {
          this.webviewReady = true;
          this.readyWaiters.forEach((resolve) => resolve());
          this.readyWaiters = [];
          return;
        }
        if (msg.type === 'progress' && msg.bookId) {
          await this.debouncedSaveProgress(msg.bookId, msg.progress);
        } else if (msg.type === 'error') {
          vscode.window.showErrorMessage(`BookNook: ${msg.message}`);
        } else if (msg.type === 'goHome') {
          if (msg.bookId && msg.progress) {
            await this.saveProgress(msg.bookId, msg.progress);
          }
          if (this.onGoHome) {
            this.onGoHome();
          } else {
            void vscode.commands.executeCommand('booknook.goHome');
          }
        }
      })
    );
  }

  private waitForReady(timeoutMs = 15000): Promise<void> {
    if (this.webviewReady) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('阅读视图加载超时，请重试'));
      }, timeoutMs);
      this.readyWaiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async openBook(bookId: string): Promise<boolean> {
    const book = this.store.getBook(bookId);
    if (!book) {
      vscode.window.showWarningMessage('书籍不存在或已被移除');
      return false;
    }

    this.reveal();
    const webview = this.getWebview();
    if (!webview) {
      vscode.window.showWarningMessage('阅读视图尚未就绪，请稍后再试');
      return false;
    }

    if (!webview.html) {
      this.bindWebview(webview);
    }

    try {
      await this.waitForReady();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`BookNook: ${msg}`);
      return false;
    }

    const payload = await this.buildPayload(book, webview);
    this.currentBookId = bookId;

    const message: HostToWebviewMessage = { type: 'load', payload };
    await webview.postMessage(message);
    await this.store.updateBook(bookId, { lastReadAt: Date.now() });
    return true;
  }

  async reloadSettings(): Promise<void> {
    const webview = this.getWebview();
    if (!webview || !this.currentBookId) {
      return;
    }
    const { fontSize, lineHeight } = getReaderConfig();
    const message: HostToWebviewMessage = {
      type: 'updateSettings',
      fontSize,
      lineHeight
    };
    await webview.postMessage(message);
  }

  notifyThemeChange(): void {
    const webview = this.getWebview();
    if (webview) {
      void webview.postMessage({ type: 'themeChanged' } satisfies HostToWebviewMessage);
    }
  }

  private async buildPayload(
    book: BookRecord,
    webview: vscode.Webview
  ): Promise<ReaderStatePayload> {
    const { fontSize, lineHeight } = getReaderConfig();
    const absPath = this.store.getAbsolutePath(book);
    const payload: ReaderStatePayload = {
      bookId: book.id,
      title: book.title,
      format: book.format,
      fontSize,
      lineHeight,
      progress: book.progress
    };

    if (book.format === 'epub') {
      const buffer = await fs.promises.readFile(absPath);
      payload.bookData = new Uint8Array(buffer);
    } else {
      payload.textContent = await readTxtContent(this.store, book);
    }

    return payload;
  }

  private debouncedSaveProgress(
    bookId: string,
    progress: BookRecord['progress']
  ): Promise<void> {
    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
    }
    return new Promise((resolve) => {
      this.progressTimer = setTimeout(async () => {
        await this.saveProgress(bookId, progress);
        resolve();
      }, 400);
    });
  }

  private async saveProgress(
    bookId: string,
    progress: BookRecord['progress']
  ): Promise<void> {
    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
      this.progressTimer = undefined;
    }
    await this.store.updateProgress(bookId, progress);
  }
}

export class ReaderPanelManager {
  private panel: vscode.WebviewPanel | undefined;
  private session: ReaderSession | undefined;

  constructor(
    private readonly store: BookshelfStore,
    private readonly extensionUri: vscode.Uri,
    private readonly bookshelfRefresh: () => void
  ) {}

  async openBook(bookId: string): Promise<void> {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'booknookReader',
        'BookNook',
        vscode.ViewColumn.One,
        { retainContextWhenHidden: true, enableScripts: true }
      );
      this.session = new ReaderSession(
        this.store,
        this.extensionUri,
        () => this.panel?.webview,
        () => {
          this.panel?.reveal(vscode.ViewColumn.One);
        }
      );
      this.panel.onDidDispose(() => {
        this.session?.dispose();
        this.session = undefined;
        this.panel = undefined;
      });
      this.session.bindWebview(this.panel.webview);
    }

    const book = this.store.getBook(bookId);
    if (book && this.panel) {
      this.panel.title = book.title;
    }

    await this.session?.openBook(bookId);
    this.bookshelfRefresh();
  }

  reloadSettings(): void {
    void this.session?.reloadSettings();
  }

  notifyThemeChange(): void {
    this.session?.notifyThemeChange();
  }

  dispose(): void {
    this.panel?.dispose();
  }
}

export function setReadingContext(reading: boolean): void {
  void vscode.commands.executeCommand('setContext', 'booknook.isReading', reading);
}

export function updateReaderLocationContext(): void {
  const loc = vscode.workspace
    .getConfiguration('booknook')
    .get<ReaderLocation>('readerLocation', 'sidebar');
  void vscode.commands.executeCommand('setContext', 'booknook.readerLocation', loc);
}

export function getConfiguredReaderLocation(): ReaderLocation {
  return vscode.workspace
    .getConfiguration('booknook')
    .get<ReaderLocation>('readerLocation', 'sidebar');
}
