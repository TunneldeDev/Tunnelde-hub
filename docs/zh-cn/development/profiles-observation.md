# Profile 元数据订阅

`sdk/profiles/client.mjs` 的实验性 `createProfilesClient(host)` 使用
`profiles.observe`，需要 `settings.read` 和当前运行代次批准。旧宿主先通过
`host.describe()` 探测支持。本客户端不选择运行时、不使用 Node 全局变量。随包
分发 `sdk/profiles/`、`sdk/runtime/observation/` 及声明，并提供支持取消/期限的传输。

```js
const profiles = createProfilesClient(host);
const owner = new AbortController();
const subscription = profiles.subscribe(async ({ items }) => {
  showProfileNames(items);
}, { signal: owner.signal });

// 功能退出时：
owner.abort();
const outcome = await subscription.done;
```

首次 `observe({}, options?)` 返回带快照的 `changed:true`，后续传入其不透明修订号。
`changed:false` 不携带快照。每份快照包含 `version:1`、`revision` 和最多 32 项
`{id,name,updatedAt}`，保持原生顺序，不含设置正文、凭据或激活权限。结果与传输
数据分离并深度冻结。Schema/类型镜像由宿主契约生成；运行消费者另外检查 UTF-8
字节限制、ID/名称唯一、首尾空白、安全时间戳、版本配对和 32 KiB 输出限制。
非法结果报错时不回显原值。

原生保存/删除将新代次与列表原子提交。元数据摘要还能识别历史写入者引起的可见
变化，不摘要私有设置。旧数据库观察不写入数据库。修订号跨重启保留，但用于
最新状态观察，不是事件游标，多个提交可能合并投递。

订阅必须绑定 owner signal，每客户端八个，读取/回调串行；结算后等待
1000–60000 ms（默认 2000），读取期限 10000 ms。停止/取消阻止迟到投递；未结算
工作仍占额度。`closed` 表示停止投递；`done` 等待结算，解析为
stopped/aborted/failed。错误不自动重试；回调自行启动的工作需自管生命周期。
[公共正文读取](profiles-content.md) 使用独立正文修订号及 SDK read 方法。正文写入、
激活及导入导出仍需独立后续契约；现有原生 Profile 控件保持兼容。
