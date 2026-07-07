import * as vscode from 'vscode';
import { BookshelfStore } from '../storage/bookshelfStore';
import { ReaderSession, setReadingContext } from './readerManager';

export class ReaderViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private session?: ReaderSession;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: BookshelfStore,
    private readonly createSession: (
      getWebview: () => vscode.Webview | undefined,
      reveal: () => void
    ) => ReaderSession
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    this.session = this.createSession(
      () => this.view?.webview,
      () => {
        void vscode.commands.executeCommand('booknook.reader.focus');
      }
    );
    this.session.bindWebview(webviewView.webview);

    webviewView.onDidDispose(() => {
      this.session?.dispose();
      this.session = undefined;
      this.view = undefined;
    });
  }

  async openBook(bookId: string): Promise<void> {
    const book = this.store.getBook(bookId);
    if (!book) {
      vscode.window.showWarningMessage('书籍不存在或已被移除');
      return;
    }

    setReadingContext(true);
    await vscode.commands.executeCommand('booknook.reader.focus');

    const session = await this.waitForSession();
    if (!session) {
      setReadingContext(false);
      vscode.window.showWarningMessage('阅读视图尚未就绪，请稍后再试');
      return;
    }

    if (this.view) {
      this.view.title = book.title;
      this.view.description = book.author;
    }

    const ok = await session.openBook(bookId);
    if (!ok) {
      this.goHome();
    }
  }

  goHome(): void {
    setReadingContext(false);
    if (this.view) {
      this.view.title = '阅读';
      this.view.description = undefined;
    }
    void vscode.commands.executeCommand('booknook.bookshelf.focus');
  }

  reloadSettings(): void {
    void this.session?.reloadSettings();
  }

  notifyThemeChange(): void {
    void this.session?.notifyThemeChange();
  }

  private waitForSession(timeoutMs = 5000): Promise<ReaderSession | undefined> {
    if (this.session) {
      return Promise.resolve(this.session);
    }
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (this.session) {
          resolve(this.session);
          return;
        }
        if (Date.now() - started >= timeoutMs) {
          resolve(undefined);
          return;
        }
        setTimeout(tick, 50);
      };
      tick();
    });
  }
}
