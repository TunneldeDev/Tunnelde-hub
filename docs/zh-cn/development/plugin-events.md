# 插件事件契约

[English](../../en-us/development/plugin-events.md)

`host.call("events.publish", { event: "progress", payload: { completed: 3 } })`
将通知发送到应用前端。此方法具有稳定的 v1 契约，自宿主 0.21.0 起可用；旧宿主可能
不返回结构说明，依赖契约元数据前应发现能力。无需额外领域权限，但审批、受限模式和
当前运行授权仍然有效。

事件名接受 1–128 个 ASCII 字母、数字、`.`、`_`、`:`、`-`。负载接受任意 JSON 值，
省略时为 `null`。额外参数无法覆盖宿主提供的身份。完整序列化参数共享 256 KiB 的
UTF-8 配额，包括 JSON 开销。

宿主在 `plugin://event` 发出 `{pluginId, generation, event, payload}`。消费者必须
校验身份和当前运行代次；停止运行前已进入队列的事件可能迟到。聊天还应校验视图、
会话、运行和序号。`contract.eventSchema` 描述这一外层结构；各插件的负载和任务 API
独立版本化或保持实验状态。应忽略不认识的新增字段。

成功返回 `null` 仅表示传输层接受，不表示订阅者处理、持久化、回放或恰好一次投递。
并发请求没有完成顺序保证。可恢复操作需要保留状态并提供查询／快照。事件无法授予权限，
不得包含秘密。非法事件名报告 `plugin.api.invalidEvent`，字段缺失或类型错误分别报告
`plugin.api.missing:event`、`plugin.api.invalid:event`，非法或超限参数对象报告
`plugin.api.invalidParams`。传输错误会拒绝调用，IO 错误文字可能因平台不同而变化。

SDK 严格按 LF 分帧，将未结束消息限制为 1 MiB，并在拼接 UTF-8 字节后解码。
U+2028/U+2029 保持普通 JSON 字符串内容，发出时转义以兼容历史读取器。已安装压缩包
保留其 SDK，新 SDK 源码不会擅自修改或重发这些压缩包；宿主发送端也会转义，以兼容
现有插件。
