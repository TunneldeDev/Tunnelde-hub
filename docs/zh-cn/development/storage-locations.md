# 宿主存储位置元数据

`sdk/storage/locations/client.mjs` 的 `createHostStorageClient(host)` 与插件 KV 客户端分开。实验接口 `observe` 和绑定所有者的 `subscribe` 需要 `storage.locations.read`；`schedule` 和 `cancel` 还需要 `storage.locations.write` 及原生用户确认。位置和元数据权限不授予文件或密钥访问权。

先读取当前不透明修订号，再提交一至八个不重复的 `{category,target,migrate}` 变更。原生确认框标明插件、规范化来源和目标、重启时机；SDK 修改调用默认截止时间为 70 秒。计划成功返回 `scheduled`，取消未开始的计划返回 `cancelled`，用户拒绝返回 `dismissed` 和最新元数据。接口不会自动重启或立即迁移。并发变更返回 `storage.locations.conflict`；恢复文件会保留，并返回 `storage.locations.recoveryRequired`。

快照包含按顺序排列的八类位置、待执行计划或 null，以及恢复标志，不暴露原始配置和错误、恢复 ID、目录清单或内容。订阅串行读取，随所有者信号取消，状态可以合并。发布围栏前取消能阻止写入；提交后的取消不回滚，应重新读取状态。尚未退出的阻塞线程仍占并发名额。DTO 和 Schema 从应用自动镜像，检查偏差，并联检实际原生输出和 SDK。用 `api.describe` 检查支持情况，方法详情参见生成的 [API 目录](../../../sdk/api.md)。
