# 编辑器命令与格式化插件

直接写入远端磁盘前，应通过 `api.describe` 检查 `files.sftp.writeText` 是否支持可选的
`baseline` 参数。传入上次读取的文本作为基线，可以检测外部修改。当前宿主会暂存并验证新文本后
原子替换；不传基线的旧调用仍受支持，但无法检测保存调用之前发生的变化。遇到冲突或网络错误时，
插件应保留草稿，以便用户检查和重试。不要盲目重试未收到确认的写入，因为它可能已经完成。
SFTP 冲突检查属于乐观检测，替换 inode 也不能保证保留硬链接关系或扩展 ACL、扩展属性。

插件可以直接处理已打开的编辑文档。点击工具栏的“格式化文档”，或按 **F1** 搜索已安装的插件命令。
插件可以提供默认快捷键；**设置 → 键盘快捷键** 列出实际绑定，并允许修改或禁用。
没有格式化提供者时不会注册格式化快捷键。配置方案会保留用户调整。

新增插件绑定与其他命令冲突时，可保留某一方、保留双方，或打开已筛选的快捷键设置。
保留的冲突会以红色标出，匹配的命令依次执行；编辑器命令只应用于其声明的文件后缀。
保留冲突前请检查绑定：`Ctrl+Shift+F` 已用于搜索工作区内容。

有多个匹配的格式化插件时先选择提供者。执行仍需经过插件权限与运行环境授权；
拒绝授权时不会发送文档内容。结果只替换尚未保存的缓冲区，可以一步撤销，保存由用户决定。
如果等待期间继续编辑、关闭后重开文档，或插件被撤销权限，过期结果会被丢弃。

## 声明方式（Tunnelde 0.29.0-beta.2 起）

```json
{
  "permissions": ["editor.read", "editor.write"],
  "engines": { "tunnelde": ">=0.29.0-beta.2" },
  "commands": [
    {
      "id": "format",
      "title": "Format document",
      "editor": { "extensions": ["json"], "format": true }
    },
    {
      "id": "compact",
      "title": "Compact document",
      "editor": { "extensions": ["json"] },
      "keybindings": ["Mod+Alt+M"],
      "macKeybindings": ["Meta+Alt+M"]
    }
  ]
}
```

后缀不含开头的点，忽略大小写，可声明复合后缀。只有 `format: true` 的命令参与
“格式化文档”选择；其他编辑器命令通过 F1 和快捷键执行。命令收到
`{source, document: {tabId, documentId, version, path, name}, indent, _locale}`，
返回 `{text: string}` 或 `{error: true, text: string}`。`indent` 是字符串形式的
编辑器缩进宽度。插件返回文本，不应直接修改磁盘文件；宿主确认文档标识及版本未变化后，
才应用为一次可撤销编辑。

输入、输出文档均限制为 128 KiB UTF-8；序列化后的整个命令输入还需满足现有
256 KiB RPC 限制，其中包括 JSON 转义开销。无效或超限结果不会替换缓冲区。
纯文本转换无需文件系统、SSH、剪贴板或网络权限。

`keybindings` 和可选的 `macKeybindings` 各最多四组，支持 `Mod`、`Ctrl`、`Meta`、
`Alt`、`Shift`，配合字母、数字、功能键或 `Comma` 等命名键。`Mod` 在 Windows/Linux
对应 Ctrl，在 macOS 对应 Command。实际 AltGraph 输入和输入法组合输入不会触发命令。
编辑器获得焦点时，编辑器命令优先于相同组合的工作台快捷键。

## 宿主 API

以下为稳定的 v1 缓冲区接口，自宿主 0.29.0-beta.2 起可用。通过 `host.describe()`
发现 `contract`；旧宿主可能支持方法但不提供稳定性元数据。错误标识、限制及兼容规则
见[核心 API 兼容性](plugin-api.md)。

- `editor.active`（`editor.read`）：返回已就绪的当前文档快照，无可用文档时返回 `null`。
  字段为 `tabId`、`documentId`、`version`、`path`、`name`、`content`、`dirty`，
  不包含 SSH 会话细节、已保存凭据或基准内容。
- `editor.replace`（`editor.write`）：参数 `{tabId, documentId, version, text}`，
  返回 `{tabId, documentId, version, dirty}`。替换可撤销，拒绝过期、已关闭、加载中或
  已断开的文档。内容不变时保留版本，实际修改后版本递增。
  撤销和重做也会递增版本。`dirty` 比较结果与已保存基线；文档过期后应重新读取，不能覆盖更新的修改。

两个接口沿用已授权的前端桥接与运行代次校验，只操作打开的缓冲区，不读取任意文件。
协议仍为 API version 1，旧接口调用保持兼容。完整生成目录及 TypeScript 类型见独立市场 SDK。

[English](../../en-us/development/editor-plugins.md) · [插件 SDK](../../../sdk/README.md)

## 直接保存本地文本

`files.local.writeText` 接受 `{path, content, baseline?}`，返回 `null`。
通过 `api.describe` 检查可选参数支持情况。传入上次读取的文本作为 `baseline` 可检测调用前的修改；
旧插件省略时仍可使用，宿主会在调用开始时读取基线并在替换前检查。
宿主先在同目录私有暂存区写入、刷盘、校验并保留支持的元数据，再原子替换已有文件。
失败时原文件保持完整。原内容及新内容必须是无 NUL 的 UTF-8 文本且不超过 512 KiB，
同时满足已有的 256 KiB 序列化 RPC 请求限制。仅需 `fs.write` 权限。
父目录必须允许创建私有暂存区；已删除的文件不会被重新创建。

工具调用还会在事务内部检查已批准路径、授权根目录解析结果及原内容哈希。
暂存前和替换前检查授权、客户端撤销和请求取消；最后一次检查后已开始的操作无法回滚。
清理失败会进入后台任务并在启动时重试。路径比较仍是乐观检测，硬链接和已打开句柄保留旧文件对象，
不保证掉电后的目录项持久性。
