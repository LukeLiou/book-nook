# BookNook 读书角

在 VS Code / Cursor 中阅读本地 **EPUB**、**TXT**，支持全局书架与阅读进度记忆。

## 功能

- 左侧 Activity Bar **BookNook** 图标
- **书架**：导入、打开、移除书籍（数据全局共用）
- **阅读区**：默认在左侧「阅读」视图；可在设置中切换为主编辑区
- **进度记忆**：自动保存滚动/章节位置
- **TXT 编码**：自动检测 UTF-8 / GBK 等常见编码
- 导入时**复制到扩展私有目录**，原文件移动不影响书架

## 开发

```bash
cd book-nook
npm install
npm run compile
```

按 F5 启动扩展开发宿主进行调试。

## 配置项

| 配置 | 说明 | 默认 |
|------|------|------|
| `booknook.readerLocation` | `sidebar` 或 `editor` | `sidebar` |
| `booknook.fontSize` | 正文字号 | `16` |
| `booknook.lineHeight` | 行高倍数 | `1.8` |

## 命令

- `BookNook: 导入书籍`
- `BookNook: 打开书籍`
- `BookNook: 从书架移除`
- `BookNook: 切换阅读区位置（侧边栏 / 编辑区）`

## 打包安装

```bash
npm run package
# 生成 book-nook-0.1.0.vsix，在 VS Code 中「从 VSIX 安装」
```
