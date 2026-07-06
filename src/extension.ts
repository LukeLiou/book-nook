import * as vscode from 'vscode';
import { BookshelfStore } from './storage/bookshelfStore';
import { importBookFromFile } from './storage/importBook';
import { BookTreeItem, BookshelfProvider } from './bookshelf/bookshelfProvider';
import { ReaderViewProvider } from './reader/readerViewProvider';
import {
  getConfiguredReaderLocation,
  ReaderPanelManager,
  ReaderSession,
  updateReaderLocationContext
} from './reader/readerManager';

let store: BookshelfStore;
let bookshelfProvider: BookshelfProvider;
let readerViewProvider: ReaderViewProvider;
let panelManager: ReaderPanelManager;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  store = new BookshelfStore(context);
  await store.initialize();

  bookshelfProvider = new BookshelfProvider(store);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('booknook.bookshelf', bookshelfProvider)
  );

  const refreshBookshelf = () => bookshelfProvider.refresh();

  readerViewProvider = new ReaderViewProvider(
    context.extensionUri,
    (getWebview, reveal) =>
      new ReaderSession(store, context.extensionUri, getWebview, reveal)
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('booknook.reader', readerViewProvider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  panelManager = new ReaderPanelManager(store, context.extensionUri, refreshBookshelf);

  updateReaderLocationContext();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('booknook.readerLocation')) {
        updateReaderLocationContext();
      }
      if (
        e.affectsConfiguration('booknook.fontSize') ||
        e.affectsConfiguration('booknook.lineHeight')
      ) {
        readerViewProvider.reloadSettings();
        panelManager.reloadSettings();
      }
    })
  );

  context.subscriptions.push(
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

    vscode.commands.registerCommand('booknook.removeBook', async (item?: BookTreeItem | string) => {
      let bookId: string | undefined;
      if (typeof item === 'string') {
        bookId = item;
      } else if (item?.kind === 'book') {
        bookId = item.book.id;
      }
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
  const location = getConfiguredReaderLocation();
  if (location === 'editor') {
    await panelManager.openBook(bookId);
  } else {
    await readerViewProvider.openBook(bookId);
  }
  bookshelfProvider.refresh();
}

export function deactivate(): void {
  panelManager?.dispose();
}
