# 共享挂载与插件 Bus

用 `host.describe()` 检查运行中的宿主是否提供某个方法；`host.extensions.describe()` 描述扩展点。发现能力不会授予权限，也不会连接主机。

## 挂载

`mounts.read` 可读宿主管理的挂载组、规则、专用连接和操作进度；修改需要 `mounts.write`。不同 SSHFS 插件共用这些持久化规则，不应各存一份，也不需要通过 Bus 同步。每组的专用 SSH 会话独立于终端和 SFTP。启用自动恢复后才会重试此前需要运行的挂载；驱动或认证问题可能需要用户介入。

先用 `mounts.rules.snapshot` 获取主机快照，再将两个 revision 交给 `mounts.groups.observe` 等待变化。写入配置使用条目的当前 revision；操作特定的运行实例时用 `runtimeId`。通过 `mounts.operations.observe` 跟踪返回的操作 ID；取消不会回滚已经提交的步骤。

若 `host.extensions.describe()` 返回 `hostDetails.mounts.nativeViewKind: "sharedMounts"`，可在主机详情页贡献宿主提供的挂载面板。面板需要 `hosts.read` 和 `mounts.read`，注册板块还需 `mounts.hostDetails`。用户可在设置中选择生效的插件，旧的一次性挂载接口仍然可用。

## 插件间通信

声明 `bus.communicate` 后，先订阅公共主题 `bus.discovery`，再用 `bus.discover` 查询某项能力的在线提供者；提供者通过 `bus.advertise` 声明能力名称和正整数版本。公共主题适合发现与低频通知。需要高频或私有通信时，用 `bus.create` 创建频道并用 `bus.invite` 邀请对方。受邀实例可通过 `bus.invitations` 查询邀请，用 `bus.join` 接受，或在支持时用 `bus.decline` 拒绝。排队中的 `bus.invitation` 通知不保证邀请依然有效。

先在**私有频道**订阅 `bus.membersChanged`，再调用 `bus.snapshot`。`channels` 只包含自己已加入的频道；`members` 是成员插件 ID，`topics` 是自己的订阅。收到成员变更通知时重读快照，所有者离开时会收到 `bus.closed`。主题精确匹配；使用宿主填写的 `sender.pluginId` 判断发送者，不要相信消息载荷里的身份声明。

从 `sdk/bus/client.mjs` 导入 `watchBus(host, handler, { signal })` 可让多个监听器共用一个接收请求；不要同时直接调用 `bus.receive`。插件结束时中止 signal。若一批消息的 `lost > 0`，重读成员快照、邀请和相关业务数据。Bus 不持久化或重放消息，也不会为接收方增加其他宿主权限。
