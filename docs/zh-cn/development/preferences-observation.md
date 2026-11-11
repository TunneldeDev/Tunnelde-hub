# 公开设置变更观察

[English](../../en-us/development/preferences-observation.md) · [表单提供者](preferences-ui.md)

实验接口 `preferences.observe` 需要 `settings.read`、插件审批与有效运行代次。
旧宿主通过 `api.describe` 检测支持情况；无需打开设置页面、可信前端或服务端订阅。

```js
import { createPreferencesClient } from "./sdk/preferences/client.mjs";

const owner = new AbortController(); // 所属功能、视图或插件结束时取消。
const preferences = createPreferencesClient(host);
const subscription = preferences.subscribe(async snapshot => {
  // 快照脱离内部状态并深冻结；不要将敏感设置值写入日志。
  applyTheme(snapshot.values.appearance.theme);
}, { signal: owner.signal, intervalMs: 2000 });

// 功能结束时：
owner.abort();
const result = await subscription.done;
if (result.reason === "failed") reportError(result.error);
```

随插件分发 `sdk/preferences/` + `sdk/runtime/observation/` 运行代码及声明和引用的 `rpc/` 类型。
客户端没有运行依赖，不使用 Node 全局对象；传入支持 `call` 取消与超时的授权传输。
它不会选择或安装运行环境。还提供 `schema()`、`read()`、`update(request)`、
`observe(request?, options?)`；修改额外需要 `settings.write` 和最新持久版本，不自动重试。

`observe({})` 返回 `{version: 1, revision, changed: true, snapshot}`；
再次提交该不透明版本，未变化时返回 `{version: 1, revision, changed: false}`，
不携带值或默认值。变化时包含版本一致的公开快照。未知输入字段、null、超出 1–128 UTF-8
字节或含控制字符的版本被拒绝。内部 Settings、凭据与界面提供者选择不在契约中。
代理身份、用户名属于公开设置内容，因此不要将完整快照记录到日志。

`subscribe` 必须绑定所属 `AbortSignal`，先通知初始快照，此后观察最新状态，不保证逐次交付提交。
元数据保存也会轮换全局版本。间隔为 1000–60000ms 整数，默认 2000ms，从每次读取和异步回调
都结算后计算；读取超时 10000ms，不重叠执行。每客户端最多八个订阅，取消但未结算的工作仍占配额。

`stop()` 可重复调用；所属信号取消和停止会取消待决读取/计时器并阻止迟到回调。
`closed` 表示已停止交付；`done` 等待传输/回调结算后完成，原因为 `stopped`、`aborted`、
`failed`（附 `error`），不拒绝 Promise。错误后停止、不自动重试，应检查 `done`。
客户端无法取消回调内部自行启动的工作。始终将所属信号绑定到销毁；自定义传输若不遵守取消和超时，
会延迟结算，但不会导致迟到回调。

这是有界轮询，不是持久事件流、审计历史或跨插件广播。方法缺失与运行撤权会报错，不回退
`settings.get`。DTO 由宿主公开设置契约生成，独立于内部 store 和界面表单提供者。
