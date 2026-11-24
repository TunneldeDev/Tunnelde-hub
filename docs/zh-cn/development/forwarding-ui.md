# 端口转发 UI 提供者

[English](../../en-us/development/forwarding-ui.md)

组件视图声明 `provider: "forwarding"`，并声明 `ui.trusted`、`hosts.read`、
`forwards.read` 权限，由用户在设置中选择。`props.forwarding` 仅对应原生面板
当前选择的已保存主机；动态来源主机须先保存为普通主机。SDK 类型位于
`sdk/ui/forwarding/entry.d.mts` 与 `provider.d.mts`；应用内的私有桥接位于
`extensions/forwarding/`，原生组件、状态、动作和契约保留在转发领域目录。

先读取 `snapshot`，再调用 `read({ revision: snapshot.revision, offset })`。
每页最多 128 条不可变记录、65536 个 UTF-16 文本单元。保留的快照仍可读取，
动作要求主机与修订仍为当前状态。不暴露 SSH 会话 ID 或可变应用状态。
`runtimeId` 标识实际运行实例，陈旧的停止操作不能停止替代实例。

可选的 `Entries` 只能挂载一次，复用原生规则列表。省略它不会卸载宿主控制器
或编辑器。主机选择、添加/刷新、凭据和主机密钥确认、监听暴露警告、编辑、
删除确认及恢复入口仍归宿主所有。编辑时提供者保持挂载但隐藏，收到
`visible: false`。通过 `capabilities.write` 判断是否展示写操作；
`forwards.write` 会在动作、延迟确认、认证完成和最终原生提交时重新检查。
完成与错误由后续快照体现，动作不承诺远端事务回滚。

`start`、`startAll`、`stop`、`requestAdd`、`requestEdit`、`requestRemove`、
`requestDisconnect` 仅操作已有规则或打开原生控件，不接受任意端点注入。
连接采用独立后台 SSH；未交付连接对其他面板隐藏，作用域关闭时清理。
已确认连接和监听可在切换表现后保留，但属于插件运行代次，撤权时关闭。
数据库中的已保存规则保留。切换离开再切回来不会复活旧作用域。
监听资源在最终授权提交前不能转发数据。

既有稳定 RPC 方法保持不变。新增实验性提供者会扩展发现与 Manifest 目标联合
类型；穷举旧目标的代码需处理未知目标。历史样例保持原样，检查仅允许明确的
新增导出与目标联合类型扩展。可信前端与宿主共享上下文和原生桥接，这些检查
不构成对恶意 JavaScript 的沙箱。
