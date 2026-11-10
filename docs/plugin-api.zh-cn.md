# 核心 API 兼容性

[English](plugin-api.en-us.md) · [SDK](../sdk/README.md) · [生成的接口目录](../sdk/api.md)

请用 `host.describe()` 检查运行中的宿主。SDK 目录跟随应用 `dev`，用户安装的正式版可能
提供较少的能力。清单的 `apiVersion: 1` 标识协议，不代表全部方法均已稳定。

## SDK 源码分类

RPC 声明按领域位于 `sdk/rpc/<领域>/`。主机元数据、字段、来源、列和菜单归属 `hosts/`；
编辑、文件、转发、挂载、执行、历史等各自定义 DTO 和方法映射。传输及插件生命周期另设
目录。`transport/methodMap.d.mts` 只组合领域映射，`tunnelde-plugin.d.mts` 只兼容导出。

```ts
import { createPlugin } from "./sdk/tunnelde-plugin.mjs";
import type { ForwardRule } from "./sdk/rpc/forwarding/contract.mjs";
import type { EditorDocument } from "./sdk/rpc/editor/contract.mjs";
```

运行时仍从原 SDK 入口导入，领域文件仅提供类型。同步检查跟随全部声明依赖，并将全部组合
方法名与宿主发现结果比较；宿主生成 DTO 更新到所属领域文件。私有导入、循环依赖、
不可达文件及未组合的方法映射均会导致检查失败。冻结的历史声明与新目录一起编译，验证
导出、输入输出及传输类型兼容性。本次分类不改变协议方法名，也不提升实验接口稳定等级。

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

## 动态主机来源（实验性）

拥有 `hosts.read` 与 `hosts.write` 的插件可通过 `hosts.setSource({ id, label, entries })` 发布运行实例所属的发现清单，通过 `hosts.removeSource({ id })` 移除。条目包含来源内唯一的 `id`、`name`、`host`、`username`，以及可选的 `port`（默认 22）、`tags` 和 `note`。接口拒绝凭据和私钥路径。每个来源最多 256 条；每个插件最多 8 个来源、512 条；全局最多 128 个来源、4096 条及 4 MiB 来源 JSON。每次替换也须符合共享的 256 KiB 请求上限。替换是原子的，验证失败会保留上一份清单。

内置主机列表按来源分组，并标明提供插件。支持 `@is:discovered`、`@is:saved`、`@source:来源ID` 和 `@plugin:插件ID`；无 `@` 的字段仍是普通搜索文字。来源主机使用统一的连接弹窗、连接质量测试与主机密钥信任流程。密码仅用于本次连接。“另存为我的主机”会创建独立副本，用于配置私钥、记住凭据、扩展字段和持久转发规则；修改或删除副本不会修改来源清单。

`hosts.sourcesSnapshot({ offset?, revision? })` 返回 `{ revision, total, nextOffset, items }`，每页至多一个来源。首次传 `{}`；后续将 `nextOffset` 作为 `offset` 并携带原 `revision`。收到 `plugin.hostSources.changed` 时从头读取；分页不预留资源，也不冻结快照。来源包含 `pluginId`、`pluginName`、`id`、`label` 和 `entries`；每条记录还包含宿主生成的 `hostId`。此接口独立于仍只返回已保存主机的 `hosts.snapshot`。

可将返回的 `hostId` 用于 `sessions.connect` 或 `workspace.openHost`。ID 绑定插件身份、来源 ID 和完整条目（包括连接目标）。条目任意信息变化都会改变 ID，因此旧弹窗会失败，不会连接被替换的目标；建立过程中来源消失也会拒绝本次连接。用户已建立的连接继续保留。插件创建的连接仍遵守运行实例／客户端所有权与显式交接规则。插件停止、崩溃、重启、撤权及进入受限模式会移除其来源，不会隐式持久化发现记录，也不会删除用户保存的副本或已信任的服务器密钥。

## 文件浏览器提供者（实验性）

可信组件视图可声明 `provider: "fileBrowser"`，不设置 `location`；要求 `ui.trusted`、
`fs.read`、`sftp.read`、`workspace.write`，由用户在界面设置中显式选择。
`FrontendViewProps.fileBrowser` 提供不可变面板/来源/路径/选择/加载快照，
`read({revision, offset?})` 按修订号分页返回当前排序与筛选后的条目，每页最多 256 条。
`navigate`、`refresh`、`select`、`open` 复用宿主原生流程。
可选 `Entries` 组件组合现有实际列表，最多挂载一次。停用、撤权、失败和受限模式恢复原生列表；
旧回调不能操作变更后的面板或替换后的提供者。路径、来源、筛选和恢复入口仍由宿主管理。
完整语义见宿主双语 `docs/plugin-file-browser.en-us.md`、`docs/plugin-file-browser.zh-cn.md`；
组合示例见 `examples/trusted-ui`。这是宿主上下文的可信代码，不是沙箱，也不额外授予权限。
