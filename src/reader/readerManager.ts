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
  const epubUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'lib', 'epub.min.js')
  );
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource};" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>BookNook</title>
</head>
<body>
  <div id="toolbar">
    <button id="btn-prev" title="上一章">‹</button>
    <select id="toc-select" aria-label="目录"></select>
    <button id="btn-next" title="下一章">›</button>
    <span id="progress-text"></span>
  </div>
  <div id="reader-shell">
    <div id="txt-reader" class="hidden"></div>
    <div id="epub-view" class="hidden"></div>
  </div>
  <div id="status" class="hidden"></div>
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

  constructor(
    private readonly store: BookshelfStore,
    private readonly extensionUri: vscode.Uri,
    private readonly getWebview: () => vscode.Webview | undefined,
    private readonly reveal: () => void
  ) {}

  dispose(): void {
    if (this.progressTimer) {
      clearTimeout(this.progressTimer);
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }

  bindWebview(webview: vscode.Webview): void {
    this.dispose();
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media')
      ]
    };

    webview.html = getReaderHtml(webview, this.extensionUri);

    this.disposables.push(
      webview.onDidReceiveMessage(async (msg: WebviewToHostMessage) => {
        if (msg.type === 'progress' && msg.bookId) {
          await this.debouncedSaveProgress(msg.bookId, msg.progress);
        } else if (msg.type === 'error') {
          vscode.window.showErrorMessage(`BookNook: ${msg.message}`);
        }
      })
    );
  }

  async openBook(bookId: string): Promise<void> {
    const book = this.store.getBook(bookId);
    if (!book) {
      vscode.window.showWarningMessage('书籍不存在或已被移除');
      return;
    }

    this.reveal();
    const webview = this.getWebview();
    if (!webview) {
      vscode.window.showWarningMessage('阅读视图尚未就绪，请稍后再试');
      return;
    }

    if (!webview.html) {
      this.bindWebview(webview);
    }

    const payload = await this.buildPayload(book, webview);
    this.currentBookId = bookId;

    const message: HostToWebviewMessage = { type: 'load', payload };
    await webview.postMessage(message);
    await this.store.updateBook(bookId, { lastReadAt: Date.now() });
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
      payload.bookUri = webview
        .asWebviewUri(vscode.Uri.file(absPath))
        .toString();
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
        await this.store.updateProgress(bookId, progress);
        resolve();
      }, 500);
    });
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
        vscode.ViewColumn.Beside,
        { retainContextWhenHidden: true, enableScripts: true }
      );
      this.session = new ReaderSession(
        this.store,
        this.extensionUri,
        () => this.panel?.webview,
        () => {
          this.panel?.reveal(vscode.ViewColumn.Beside);
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

  dispose(): void {
    this.panel?.dispose();
  }
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
