# Syntax Highlighting desktop acceptance / 高亮插件界面验收

Passed on 2026-11-24 (Asia/Shanghai) using the installed Tunnelde desktop application. This supplements the [protocol tests](verification.md) and [GitHub contribution workflow acceptance](workflow-acceptance.md).

2026-11-24 使用实际安装的 Tunnelde 完成验收，覆盖官方发布包安装、本地文件与真实 SSH 文件高亮。

## Environment / 环境

| Item / 项目 | Value / 记录 |
| --- | --- |
| Host | macOS, Apple Silicon |
| Tunnelde | 2.8.0-beta.6, Tauri 2.12.5 |
| Plugin | Syntax Highlighting 1.0.1 |
| Release | [Official v1.0.1](https://github.com/TunneldeDev/Tunnelde-plugin-syntax-highlighting/releases/tag/v1.0.1) |
| Archive | `syntax-highlighting-1.0.1.zip` |
| SHA-256 | `5f5a37c22f81a26a38dfbbd8008ac7b20d89968e0dbb298b0653d7249f2d08b8` |
| Runtime | Node.js 26.11.1; plugin CI separately covers Node 22/24 |
| Access | User approved Node execution and `editor.read` in the application permission dialog |
| SSH | Saved Local host, `127.0.0.1:22`; actual authenticated SSH file session |

The downloaded release metadata matched the production Hub catalogue. The archive passed SDK verification before installation. GitHub Raw was unreliable on this machine, so the application retained a cached marketplace catalogue. Installation used **Install plugin → local ZIP** with the verified official release. Installing directly from a freshly refreshed marketplace was therefore not verified in this session.

下载的发布元数据与正式 Hub 目录一致，ZIP 经 SDK 校验后才安装。本机访问 GitHub Raw 不稳定，应用仍使用市场缓存，因此通过“安装插件 → 本地 ZIP”导入官方包。本次没有验证从刷新后的市场列表直接安装。

## Results / 结果

| Check / 检查 | Observed result / 实际结果 |
| --- | --- |
| Install and start / 安装启动 | Application identified v1.0.1, showed its three highlight commands and entered Running after explicit permission approval. |
| Local TypeScript / 本地 TS | Opened a dedicated temporary `.ts` file through Quick Access. Keywords, strings, numbers, template interpolation and multiline comments displayed distinct colors. |
| Local editing / 本地编辑 | Replaced the editor buffer with a comment and an exported typed string declaration. Highlighting refreshed automatically on the unsaved content. |
| Stop / 停止 | Stopped the plugin from its detail page. The same unsaved editor content immediately returned to plain text colors. |
| Restart / 重启 | Started the plugin again. Highlighting returned on the existing unsaved buffer. |
| Live SSH Python / 真实 SSH Python | Connected through the saved Local host, navigated the remote file pane to the dedicated temporary directory and opened `.py`. Imports, class/function keywords, numbers, multiline docstrings and f-string interpolation displayed highlighting. |
| SSH editing and saving / SSH 编辑保存 | Replaced the remote buffer with a comment, string and conditional expression. Highlighting refreshed; Save completed and cleared the unsaved marker. |
| Cleanup / 清理 | Closed both test editors, discarded the local unsaved test edit, closed the SSH file browser and observed zero active connections. Removed the dedicated temporary fixture/download directory afterward. |

高亮效果通过实际界面观察确认。插件保持已安装并运行，方便继续使用；其他已安装插件未变更。

## Repeat the acceptance / 复验步骤

1. Download the versioned ZIP, `marketplace.json` and `SHA256SUMS` from the official release. Verify the archive against the Hub entry and SDK archive checks.
2. Install the ZIP in Tunnelde, explicitly start it and review/approve the execution and editor-read permissions.
3. Create a disposable TypeScript file containing keywords, strings, a number, a template string and a multiline comment. Open it in the local editor and observe the colors.
4. Edit its buffer. Confirm automatic refresh, then stop and restart the plugin to confirm colors disappear and return without changing text.
5. Connect to a test SSH host through the normal login flow. Open a disposable Python file from the **remote** file pane, including a multiline docstring and f-string. Confirm colors, edit refresh and saving.
6. Close the test editors and SSH session, remove only the disposable files and record the application/plugin versions, archive digest and any incomplete checks.

后续发布应在插件仓库 CI 通过后按以上步骤复验。测试文件应专门创建，使用完即清理；记录未覆盖的环境，避免把协议模拟当作 SSH 界面验收。

This is a manual smoke test on one macOS application version, using SSH loopback. It does not establish acceptance on Windows/Linux, a separate remote OS, all supported languages, large files, permission revocation or every theme. Those are outside this manual run; protocol tests retain their separately documented coverage.

本次是单一 macOS 应用版本及 SSH 回环连接的人工冒烟验收，没有覆盖 Windows/Linux、独立远端操作系统、所有语言、大文件、撤销权限及全部主题。这些范围不能由本次结果推断通过。
