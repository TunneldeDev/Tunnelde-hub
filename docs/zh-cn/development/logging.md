# 读取持久化日志

实验接口 `logs.read` 需要独立权限，稳定写入接口 `log` 保持分离。授权覆盖应用和其他插件日志，
消息及上下文可能包含敏感元数据。调用前通过 host.describe() 检查支持。

```js
import { createLoggingClient } from "./sdk/logging/client.mjs";
const logs = createLoggingClient(host);
const owner = new AbortController();
const sub = logs.subscribe(
  async (page) => {
    if (page.gap) showIncompleteHistory();
    await appendEntries(page.entries);
  },
  { signal: owner.signal, intervalMs: 2000 },
  {
    source: "diagnostics",
    filter: { levels: ["warn", "error"] },
  },
);
// 所属视图／运行代次释放时：
owner.abort();
await sub.done;
```

前端可用 `{call:(...args)=>context.api.call(...args)}` 适配，无需 Node。
read({source?,cursor?,filter?,limit?},options?) 返回 version1 的结构化页，包括 entries、cursor、
hasMore、reset、gap。每项包含 timestamp|null、level、domain、pluginId|null、message、fields、
truncated。source 默认 diagnostics，operations 读取保留的操作历史。limit 为1–200，默认100；
领域／插件／级别精确匹配，同字段取或、跨字段取且，另支持投影后文本的不区分大小写检索。
具体限额见镜像 sdk/logging/schema.json 与 sdk/rpc/logging/data/。null、额外请求字段及重复筛选值无效。

游标绑定进程、运行代次、所属插件、来源和规范化筛选，不选择路径也不授予权限。改查询或重启需从头读。
诊断仅从当前日志最近256KiB内开始，每次最多扫描256KiB／2048条，未完成尾行等追加；坏行／过长行
跳过并报告gap。轮转、替换、截断会使位置失效并报告reset/gap，不补读旧文件。身份及前64字节检查
只是追加日志的尽力检测，不是不可变快照，也不能证明任意原地改写未发生。操作历史保留最近1000条。
不承诺可靠投递或完整历史审计。

宿主原始JSON页最多128KiB、单项64KiB、消息16KiB。JavaScript可能展开小数表示，SDK对解码／重新编码
工作另设256KiB限额，并深冻结结果。结构化凭据键及HTTP/SOCKS URL会脱敏，任意文本或URL路径无法可靠清除。

订阅要求owner signal与1–60秒整数轮询间隔；单次读取截止10秒，每客户端最多8个。分页和回调串行，
页间让出执行权，连续32页后等待轮询周期。停止／取消后不交付迟到回包，但未结束工作结算前仍占名额。
done返回stopped／aborted或{reason:"failed",error}；失败终止而非静默丢弃游标重读。
宿主还有独立的四个阻塞工作名额，取消等待方不会提前释放。

错误包括logs.read.invalidRequest、logs.read.invalidCursor、logs.read.unavailable、plugin.api.busy
及共用授权／取消错误。此RPC不返回文件系统／数据库细节，可通过应用输出查看本地诊断；调用方须处理未知错误。
此接口配套宿主／SDK DTO和Schema同步检查，以及真实Rust产出到SDK消费者的CI。
