# 宿主存储恢复 SDK

使用前发现实验性 `storage.recovery.observe` 和 `storage.recovery.request` 方法。
它们需要独立的 `storage.recovery.read` 权限，请求还需要 `storage.recovery.write`。

```js
import { createHostStorageRecoveryClient } from "./sdk/storage/recovery/client.mjs";
const recovery = createHostStorageRecoveryClient(host);
const observation = await recovery.observe();
if (observation.changed && observation.snapshot.pending) {
  await recovery.request(
    { revision: observation.revision, action: "retry" },
    { signal: owner.signal },
  );
}
```

宿主标明插件身份并要求用户确认。`restartScheduled` 只表示意图已记录，由用户选择
重启时间。retry 保持已有方向，正在取消的计划不能改回迁移；cancel 总是选择取消。
拒绝后返回带最新快照的 `dismissed`。默认 70 秒传输超时覆盖 55 秒确认窗口。
不要自动重试结果不确定的写入，应先重新观察真实状态。

`pending.restartRequested` 区分等待重启的请求与已开始执行的尝试。
`hasError` 只返回错误是否存在。`recordedCopies` 按类别、类型排序，每个类别最多记录
一个 previous/archive 路径。不返回内容、原始错误或私有标识。路径不能证明存在、
完整性、归属、完整历史或删除权限。此客户端不能执行迁移文件操作、删除副本或重启软件。

通过 `subscribe(callback,{signal:owner.signal,intervalMs:2000})` 进行随所属方退出的
串行最新状态轮询；它不是逐次写入事件流。DTO 和 Schema 从宿主同步，运行结果会校验
并深度冻结。提交围栏、限额及明确的恢复边界见应用的
[恢复契约](https://github.com/TunneldeDev/Tunnelde/blob/dev/docs/zh-cn/development/plugins/storage-recovery.md)。
