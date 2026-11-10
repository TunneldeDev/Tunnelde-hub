# 插件自有配置

[English](configuration.en-us.md)

声明可选 `configuration` 元数据后，用户即可在宿主**设置 → 插件**的折叠表单中编辑配置，无需启动插件代码。搜索支持 `@plugin:`、`@group:`、`@id:` 及漏斗预设。配置按插件标识作用于整个应用，位于可移动的插件数据类别，卸载后保留；凭据应使用密钥 API。

声明包含正整数 `version`、`groups`、`fields` 和可选的纯数据 `migrations`。每个字段包含 `id`、`group`、`title`、可选 `description`、有界 `schema` 及有效 `default`。支持布尔、有界字符串和枚举、有界数值和整数、有界数组及封闭对象。市场与宿主都会拒绝未知关键字、原型键、可执行校验器、外部引用和无效默认值。完整限制与迁移操作见宿主的双语[配置契约](https://github.com/TunneldeDev/Tunnelde/blob/dev/docs/plugin-configuration.zh-cn.md)。

```js
import { createConfigurationClient } from "./sdk/configuration/client.mjs";

const configuration = createConfigurationClient(host);
const methods = new Set((await host.describe()).methods.map(method => method.name));
if (methods.has("configuration.snapshot")) {
  const snapshot = await configuration.snapshot();
  if (snapshot.status === "ready") {
    const values = { ...snapshot.values, enabled: true };
    await configuration.update({
      expectedRevision: snapshot.revision,
      schemaDigest: snapshot.schemaDigest,
      values,
    });
  }
}
```

独立门面提供严格方法签名，没有动态回退重载。发布 Node 插件时请保持相对目录结构复制该辅助模块；它只包装现有已授权 `host.call` 传输，不启动 Node，也不授予全局设置权限。可信 UI 插件可通过已有 `context.api.call` 使用相同 RPC 请求。在旧宿主上使用前应先检查方法是否存在。

读取不会保存默认值或迁移数据。普通写入需提供全部已声明值、当前 UUID 修订和 Schema 摘要。缺少迁移链、同版本修改数据结构或降级都会保留原数据并阻止替换。迁移需由插件明确调用 `migrate`，或由用户在原生表单确认；步骤必须形成精确版本和摘要链，只运行纯数据 `rename`、`setDefault`、`remove` 操作。源和目标摘要可从各自快照取得，元数据及迁移声明不参与摘要。

`backups`、`restore`、`deleteBackup` 仅访问调用插件自己的数据。迁移与恢复在同一事务中保留旧文档。每插件最多保留 8 份备份，不自动淘汰。恢复生成新修订，之后可能需要迁移。冲突应提示审查，不得重新取修订后用旧草稿自动覆盖。不要记录配置值。宿主 `plugin://configuration-changed` 事件只含所属插件标识、修订和摘要，不包含值；本功能并未新增通用插件事件订阅 API。

公开 DTO 位于 `sdk/rpc/configuration/data/`，方法签名位于 `methods.d.mts`，门面契约位于 `client.d.mts`，可执行辅助模块位于 `sdk/configuration/`。它们镜像选定宿主的公开契约，由 `sdk:check` 校验。所有配置方法仍为**实验接口**；现有稳定存储、偏好 API、历史 SDK 导出和协议版本 1 保持兼容。
