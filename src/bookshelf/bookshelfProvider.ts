import * as vscode from 'vscode';
import { BookRecord } from '../types';
import { BookshelfStore } from '../storage/bookshelfStore';

function progressLabel(book: BookRecord): string {
  const pct = Math.round((book.progress.scrollPercent ?? 0) * 100);
  if (pct <= 0) {
    return '未读';
  }
  if (pct >= 99) {
    return '已读完';
  }
  return `${pct}%`;
}

export class BookTreeItem extends vscode.TreeItem {
  constructor(
    public readonly book: BookRecord,
    public readonly kind: 'book' | 'empty'
  ) {
    super(
      kind === 'empty' ? '暂无书籍，点击 + 导入' : book.title,
      vscode.TreeItemCollapsibleState.None
    );

    if (kind === 'book') {
      this.contextValue = 'book';
      const author = book.author ? ` · ${book.author}` : '';
      this.description = `${book.format.toUpperCase()} · ${progressLabel(book)}`;
      this.tooltip = `${book.title}${author}\n原文件：${book.originalName}`;
      this.command = {
        command: 'booknook.openBook',
        title: '打开',
        arguments: [book.id]
      };
      if (book.coverDataUrl) {
        this.iconPath = vscode.Uri.parse(book.coverDataUrl);
      } else {
        this.iconPath = new vscode.ThemeIcon(
          book.format === 'epub' ? 'book' : 'file-text'
        );
      }
    } else {
      this.iconPath = new vscode.ThemeIcon('info');
    }
  }
}

export class BookshelfProvider implements vscode.TreeDataProvider<BookTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<BookTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly store: BookshelfStore) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BookTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): BookTreeItem[] {
    const books = this.store.getBooks();
    if (books.length === 0) {
      return [new BookTreeItem({} as BookRecord, 'empty')];
    }
    return books.map((b) => new BookTreeItem(b, 'book'));
  }
}
