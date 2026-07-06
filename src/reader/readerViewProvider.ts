import * as vscode from 'vscode';
import { ReaderSession } from './readerManager';

export class ReaderViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private session?: ReaderSession;

  constructor(
    private readonly extensionUri: vscode.Uri,
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
    if (!this.session) {
      await vscode.commands.executeCommand('booknook.reader.focus');
    }
    await this.session?.openBook(bookId);
  }

  reloadSettings(): void {
    void this.session?.reloadSettings();
  }
}
