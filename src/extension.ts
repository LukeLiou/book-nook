import * as vscode from 'vscode';
import { BookshelfStore } from './storage/bookshelfStore';
import { importBookFromFile } from './storage/importBook';
import { BookshelfViewProvider } from './bookshelf/bookshelfViewProvider';
import { ReaderPanelManager, updateReaderLocationContext } from './reader/readerManager';

let store: BookshelfStore;
let bookshelfViewProvider: BookshelfViewProvider;
let panelManager: ReaderPanelManager;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  store = new BookshelfStore(context);
  await store.initialize();

  bookshelfViewProvider = new BookshelfViewProvider(context.extensionUri, store);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('booknook.bookshelf', bookshelfViewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  const refreshBookshelf = () => void bookshelfViewProvider.refresh();

  panelManager = new ReaderPanelManager(store, context.extensionUri, refreshBookshelf);

  updateReaderLocationContext();
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      bookshelfViewProvider.notifyThemeChange();
      panelManager.notifyThemeChange();
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('booknook.readerLocation')) {
        updateReaderLocationContext();
      }
      if (
        e.affectsConfiguration('booknook.fontSize') ||
        e.affectsConfiguration('booknook.lineHeight')
      ) {
        bookshelfViewProvider.reloadSettings();
        panelManager.reloadSettings();
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('booknook.goHome', () => {
      void bookshelfViewProvider.goHome();
    }),

    vscode.commands.registerCommand('booknook.importBook', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: '导入',
        filters: {
          书籍: ['epub', 'txt']
        }
      });
      if (!uris?.[0]) {
        return;
      }
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: '正在导入书籍…'
          },
          async () => {
            const book = await importBookFromFile(store, uris[0].fsPath);
            refreshBookshelf();
            await openBookById(book.id);
            vscode.window.showInformationMessage(`已导入「${book.title}」`);
          }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`导入失败：${msg}`);
      }
    }),

    vscode.commands.registerCommand('booknook.openBook', async (bookId?: string) => {
      if (!bookId) {
        const pick = await vscode.window.showQuickPick(
          store.getBooks().map((b) => ({
            label: b.title,
            description: b.author,
            bookId: b.id
          })),
          { placeHolder: '选择要打开的书籍' }
        );
        if (!pick) {
          return;
        }
        bookId = pick.bookId;
      }
      await openBookById(bookId);
    }),

    vscode.commands.registerCommand('booknook.removeBook', async (bookId?: string) => {
      if (!bookId) {
        const pick = await vscode.window.showQuickPick(
          store.getBooks().map((b) => ({
            label: b.title,
            bookId: b.id
          })),
          { placeHolder: '选择要从书架移除的书籍' }
        );
        if (!pick) {
          return;
        }
        bookId = pick.bookId;
      }
      const book = store.getBook(bookId);
      if (!book) {
        return;
      }
      const ok = await vscode.window.showWarningMessage(
        `确定从书架移除「${book.title}」？（不会删除你电脑上的原文件）`,
        { modal: true },
        '移除'
      );
      if (ok !== '移除') {
        return;
      }
      await store.removeBook(bookId);
      refreshBookshelf();
    }),

    vscode.commands.registerCommand('booknook.refreshBookshelf', () => {
      refreshBookshelf();
    }),

    vscode.commands.registerCommand('booknook.toggleReaderLocation', async () => {
      const cfg = vscode.workspace.getConfiguration('booknook');
      const current = cfg.get<'sidebar' | 'editor'>('readerLocation', 'sidebar');
      const next = current === 'sidebar' ? 'editor' : 'sidebar';
      await cfg.update('readerLocation', next, vscode.ConfigurationTarget.Global);
      updateReaderLocationContext();
      vscode.window.showInformationMessage(
        `阅读区已切换为：${next === 'sidebar' ? '左侧边栏' : '主编辑区'}`
      );
    })
  );
}

async function openBookById(bookId: string): Promise<void> {
  const location = vscode.workspace
    .getConfiguration('booknook')
    .get<'sidebar' | 'editor'>('readerLocation', 'sidebar');
  if (location === 'editor') {
    await panelManager.openBook(bookId);
  } else {
    await bookshelfViewProvider.openBook(bookId);
  }
}

export function deactivate(): void {
  panelManager?.dispose();
}
