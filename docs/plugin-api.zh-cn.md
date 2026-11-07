# 核心 API 兼容性

[English](plugin-api.en-us.md) · [SDK](../sdk/README.md) · [生成的接口目录](../sdk/api.md)

请用 `host.describe()` 检查运行中的宿主。SDK 目录跟随应用 `dev`，用户安装的正式版可能
提供较少的能力。清单的 `apiVersion: 1` 标识协议，不代表全部方法均已稳定。

首批稳定核心为 `api.describe`、`sessions.list`、`storage.get`、`storage.set` 和
`storage.delete`。这些方法自 0.21.0 提供；`since` 表示首次可用版本，不表示稳定承诺建立
的版本。稳定方法通过可选的版本 1 `contract` 提供 draft-07 的 `inputSchema`、
`resultSchema`、`errorSchema`，以及 `knownErrors` 和 `events`。旧宿主可能没有这些元数据。
请忽略新增字段，使用前发现方法，并处理未知错误。设置、工作区、聊天和远端运行器仍为实验接口。

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
`sessions.connect` 使用相同 DTO，但该方法仍为实验接口。

宿主错误包含整数 `code`、字符串 `message`，通常还包含表示类别的 `data.code`。
非法参数对象或请求过大使用 `-32602`；授权失败使用 `-32001`；存储、配额和 IO 错误使用
`-32000`。已知存储消息包括 `plugin.api.missing:<field>`、`plugin.api.invalid:<field>`、
`plugin.api.invalidStorageKey`、`plugin.api.invalidStorage` 和 `plugin.api.storageTooLarge`。
`knownErrors` 不穷举操作系统错误。传输层可能以 `-32002` 拒绝过大的响应且不附带 `data`。

应用会用冻结的契约底线校验宿主生成的响应，并通过冻结的契约引入前 SDK 回放。兼容性
探针还完成了隔离的 Windows 桌面验收，覆盖持久化、隔离、配额与授权撤销。这覆盖明确
的核心范围，不证明全部方法、平台或历史插件行为兼容。Hub CI 将生成目录和类型方法名
与应用 `dev` 对比；宿主变更后请用 `npm run sdk:sync -- ../Tunnelde` 重新生成。
