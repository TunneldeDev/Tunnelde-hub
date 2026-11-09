# 核心 API 兼容性

[English](plugin-api.en-us.md) · [SDK](../sdk/README.md) · [生成的接口目录](../sdk/api.md)

请用 `host.describe()` 检查运行中的宿主。SDK 目录跟随应用 `dev`，用户安装的正式版可能
提供较少的能力。清单的 `apiVersion: 1` 标识协议，不代表全部方法均已稳定。

首批稳定核心为 `api.describe`、`sessions.list`、`storage.get`、`storage.set` 和
`storage.delete`。这些方法自 0.21.0 提供；`since` 表示首次可用版本，不表示稳定承诺建立
的版本。稳定方法通过可选的版本 1 `contract` 提供 draft-07 的 `inputSchema`、
`resultSchema`、`errorSchema`，以及 `knownErrors` 和 `events`。旧宿主可能没有这些元数据。
请忽略新增字段，使用前发现方法，并处理未知错误。设置、工作区修改、聊天和远端运行器仍为实验接口。
稳定范围还包括状态栏贡献和 `editor.active`/`editor.replace`。编辑器方法自
0.29.0-beta.2 起可用；`since` 表示首次提供方法的版本，不是冻结 v1 契约的版本。
标签栏注册和移除也有稳定 v1 契约，通过可选的 `commandContextSchema` 描述
`_locale` / `_tabBar` 建议性命令输入。完整替换、生命周期和作用域规则见
[标签栏贡献](tab-bar.zh-cn.md)。

| 方法             | 权限            | 行为                                                                      |
| ---------------- | --------------- | ------------------------------------------------------------------------- |
| `api.describe`   | 无              | 对象参数；返回协议版本和方法说明。                                        |
| `sessions.list`  | `sessions.read` | 对象参数；返回当前已认证会话，可能为空。已保存主机不等于会话。            |
| `storage.get`    | 无              | `{key}`；读取该插件的 JSON 值。键不存在及存入 JSON `null` 均返回 `null`。 |
| `storage.set`    | 无              | `{key,value}`；持久化包括 `null` 在内的任意 JSON 值，返回 `null`。        |
| `storage.delete` | 无              | `{key}`；存在时移除该值，即使不存在也返回 `null`。                        |

所有调用都要求插件已批准且正在运行；撤销授权和受限模式会阻止访问。存储按插件身份
隔离，运行时重启后保留，不需要文件系统权限。键由 1–128 个 ASCII 字母、数字、点、
下划线或连字符组成；`__proto__`、`constructor` 和 `prototype` 为保留名称。
未知请求字段会被忽略。请求按 UTF-8 编码的 JSON 限制为 256 KiB；完整存储 JSON 对象
另有 256 KiB 配额，包含所有键和序列化开销。结构校验与字节限制、授权和运行状态检查
分别进行。文件替换不承诺断电持久性。这五个方法均不产生事件。

会话 DTO 包含 `id`、`hostId`、`title`、`address`、`cols`、`rows` 和 `connectedAt`（Unix
时间戳，毫秒），不暴露内部终端、用途字段及凭据。列出的会话可能在下次调用前断开。
`sessions.connect` 使用相同 DTO，但该方法仍为实验接口。它创建的连接归调用方的运行代次
所有，停止、崩溃、撤权或替换代次时会关闭；打开终端或文件标签页不转移所有权。
连接中与已连接的会话共用每插件 8 条、插件总计 64 条的配额，建立连接的总截止时间为
120 秒。主机密钥验证保持有效。需要独立生命周期时，应使用用户主动建立的已有会话；
可用实验接口 `sessions.requestHandoff({sessionId})` 显式交接。宿主原生确认框会标明插件
与连接；交接成功返回 `true`，拒绝返回 `false`，超时、撤权、断线、非本代次资源及尚未接受
的工具结果会失败。全应用同时只允许一个确认框，旧窗口关闭后再重试；过期确认不能生效。
交接后连接由用户管理，插件/客户端清理及受限模式均保留它；用户主动断开及退出应用仍会关闭。
该方法不打开标签页、不交接依赖任务、不持久化连接、不授予新访问权限，并且不对
`tools.invoke` 开放。`sessions.list` 仍列出全部活动会话。

通过 `tools.invoke` 创建的连接还归属其 `clientId`（默认 `agent`）。
`tools.revokeClient` 会在当前运行代次内永久撤销该身份，取消其待完成调用并释放其任务、
传输和 SSH 连接；其他客户端、插件直接调用、用户连接及替换代次保持有效。
恢复时使用新的客户端身份。`tools.cancel` 会关闭结果尚未被接受的连接；已完成请求交付的
连接不受影响。复用公开请求 ID 不会受到旧请求清理影响。已经完成的远端操作不会回滚。
这些生命周期规则不改变稳定会话 DTO 的字段。

宿主错误包含整数 `code`、字符串 `message`，通常还包含表示类别的 `data.code`。
非法参数对象或请求过大使用 `-32602`；授权失败使用 `-32001`；存储、配额和 IO 错误使用
`-32000`。已知存储消息包括 `plugin.api.missing:<field>`、`plugin.api.invalid:<field>`、
`plugin.api.invalidStorageKey`、`plugin.api.invalidStorage` 和 `plugin.api.storageTooLarge`。
`knownErrors` 不穷举操作系统错误。传输层可能以 `-32002` 拒绝过大的响应且不附带 `data`。

## 工作区快照契约

`workspace.snapshot` 需要 `workspace.read`，自 0.21.0 起提供。冻结的 v1 结果使用独立的
`PluginWorkspaceSnapshot`：`tabs`、`panes`、`activeId`、`activePaneId` 和递归的
`layout`。宿主逐字段复制已有数据，不暴露以后新增的内部状态、编辑器内容、草稿或凭据。
文件窗格元数据保留来源和会话标识、路径、视图设置、远端身份及离线状态。可选字段保持
可选，并保留显式的 `false` 或 `null`。标签类型及视图选项字符串是开放值，必须容忍新值。

隐藏的面板标签可留在记忆的窗格中。布局分支的 `row` 为水平、`column` 为垂直，比例在
0 到 1 之间。每次请求读取当前状态，不保留标签或会话，也不授予文件或 SSH 访问权限。
本方法不产生事件。宿主在分发前和回复后检查授权；仍可能出现前端超时、关闭、繁忙、
请求过期和响应超过字节限制等错误。

`npm run sdk:sync -- ../Tunnelde` 从宿主独立投影模块复制工作区类型声明。检查模式检测
声明缺失或漂移，不写 SDK 文件。返回相同快照的工作区修改方法仍为实验接口。

## 编辑器缓冲区契约

`editor.active` 需要 `editor.read`，返回当前聚焦的就绪编辑器快照
`{tabId, documentId, version, path, name, content, dirty}`。当前不是编辑器，或文档
加载中、失败、断线、已关闭时返回 `null`。快照包含未保存修改，不会重新读取任意文件。
内容超过 128 KiB UTF-8 字节时报告 `plugin.api.frontend:editor.documentTooLarge`。

`editor.replace` 需要 `editor.write`，参数为 `{tabId, documentId, version, text}`，
返回独立的 `EditorWriteResult`：`{tabId, documentId, version, dirty}`。替换是一次
可撤销的缓冲区操作，不自动保存。内容改变时递增版本，内容相同时保留版本和撤销历史；
撤销、重做也会递增版本。过期、已关闭再打开或不可用的文档报告
`plugin.api.frontend:editor.documentChanged`。应重新读取并让用户重试，不能覆盖更新的
修改。`dirty` 比较替换后的内容与已保存基线。

ID 必须非空、不含 NUL，且不超过 1,024 个 UTF-16 码元；版本是非负安全整数。文本
允许为空，UTF-8 编码后最多 128 KiB。未知输入字段会被忽略，调用方必须忽略未来新增的
返回字段。结构中的字符长度独立于字节限制和状态检查。字段错误报告
`plugin.api.frontend:invalid:<field>`，代码为 `-32000`；授权失败使用 `-32001`。
前端桥还可能报告 `plugin.api.busy`、`plugin.api.frontendTimeout`、
`plugin.api.frontendClosed` 和 `plugin.api.requestExpired`。这两个方法不产生插件事件，
也不会自动订阅文档变化。另见[编辑器插件](editor-plugins.zh-cn.md)。

应用会用冻结的契约底线校验宿主生成的响应，并通过冻结的契约引入前 SDK 回放。兼容性
探针还完成了隔离的 Windows 桌面验收，覆盖持久化、隔离、配额与授权撤销。这覆盖明确
的核心范围，不证明全部方法、平台或历史插件行为兼容。Hub CI 将生成目录和类型方法名
与应用 `dev` 对比；宿主变更后请用 `npm run sdk:sync -- ../Tunnelde` 重新生成。

## 本地日志契约

`log` 需要 `log` 权限和已批准的运行中插件，其冻结 v1 契约包含在接口发现中。
保留旧 `host.log(message, level)` 调用。结构化选项和按指定级别写入需要
0.33.0-beta.5 或更新宿主；`since: 0.21.0` 表示方法首次可用版本。应配置
`engines.tunnelde` 或发现契约后再依赖新语义。

`host.log(message, {level, domain, operation, requestId, fields})` 接受记录后返回 `null`，
仍受过滤和有界可丢失写入器影响，不承诺持久化，也不订阅事件。身份和运行代次由宿主
生成；领域前缀为 `plugins.<id>.`。message 最多 16 KiB UTF-8；可选标识符接受 null，
或 1–128 个 ASCII 字母、数字、`.`、`_`、`-`、`:`。fields 是脱敏前最多 16 KiB 的对象，
最多访问 256 个节点（包括根）、根下最多四层，键是最多 64 字节的标识符。运行时配额
独立于结构描述。结构化敏感键会脱敏，HTTP/SOCKS URL 值移除凭据、查询和片段；
任意文本和 URL 路径中的秘密无法可靠识别，必须避免写入凭据或文档内容。

格式错误返回 `plugin.api.invalid:log`，限制错误返回 `logs.invalid:<字段>`，RPC 代码
均为 `-32000`。公共参数校验和授权错误使用 `-32602`、`-32001`；仍可能有未知错误。
本地日志文件布局不属于此 API 的稳定契约。

## 通知与确认

`ui.showMessage` 和 `ui.confirm` 在接口发现包含其结构时采用稳定 v1 契约。
两者需要已批准且运行中的插件，不要求额外权限；`since: 0.21.0` 表示首次可用版本，
不代表契约元数据的引入时间。消息为非空纯文本，不能含 NUL；未知字段会被忽略，
通知前缀和确认标题由宿主使用实际安装的插件名称生成。

`ui.showMessage({message, kind})` 接受最多 4,000 个 UTF-16 码元。
kind 为 info、success 或 error；省略或 null 使用 info。返回 null 仅表示接受临时展示，
不保证持久化或用户已经阅读。

`ui.confirm({message})` 接受最多 220 × 1,024 个 UTF-16 码元，同时受整个序列化请求
256 KiB UTF-8 限制。只有明确确认返回 true；关闭、替换或 55 秒 UI 超时返回 false。
要等待此超时，应将调用时限设为大于 55 秒；较短的 SDK 时限可能先报错。
已有弹窗时不会覆盖，返回 `plugin.api.frontend:dialog.busy`。停止、撤销批准或取消请求
可能报错而非返回布尔值；异步授权期间取消的请求不得延迟弹出界面。字段错误使用
`plugin.api.frontend:invalid:message` 或 `plugin.api.frontend:invalid:kind`。
这些方法不授予权限，也不提供操作、事件订阅或内部 UI 状态。结构的字符计数独立于
运行时 UTF-16 及请求字节配额。
