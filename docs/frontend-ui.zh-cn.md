# 可信前端插件

[English](frontend-ui.en-us.md) · [扩展架构](plugin-api.zh-cn.md)

实验性 UI SDK 独立于 RPC 的 `apiVersion: 1` 进行版本管理。
`extensions.describe().frontend` 返回其版本、信任模型、组件和限制。
市场 SDK 提供 `tunnelde-ui.d.mts`，从宿主公开契约生成，不暴露内部状态仓库或组件源码路径。

前端命令可以贡献[主机菜单操作](host-menu.zh-cn.md)。

## 按领域导入类型

`sdk/tunnelde-ui.d.mts` 保留为兼容入口。声明按领域归属到 `sdk/ui/<领域>/`，
分别管理运行资源、公共组件、搜索、前端生命周期、工作台、文件、终端和历史。
可以继续从旧入口导入，也可以直接引用领域文件：

```ts
import type { FrontendContext } from "./sdk/tunnelde-ui.mjs";
import type { FrontendTerminal } from "./sdk/ui/terminal/surface.mjs";
```

这些导入在 TypeScript 编译后被移除，运行时 SDK 仍来自激活上下文。
开发插件时应复制完整 SDK 声明目录。`sdk:sync` 跟随宿主公开依赖图，
`sdk:check` 校验全部文件及 `ui-contracts.json`。私有类型、运行时代码导入、
循环依赖、未导出契约和遗留生成文件都会导致校验失败；历史声明保留为兼容样例。
分类不改变 UI SDK 0.1.0 的实验性状态或既有 RPC 协议。

仓库开发时先执行 `npm ci --ignore-scripts`，再执行 `npm test`。
固定版本的 TypeScript 及 React/Node 声明仅用于测试，不会让插件隐式使用 Node
运行时，也不会为插件引入第二份 React。

## 清单和模块

纯前端插件不需要 Node。既有 Node、WASM 和声明式插件也可以增加相同的 `frontend`
声明，保留原后端；组合运行时仅对前端处理的命令增加 `frontend: true`。

```json
{
  "id": "custom-view",
  "name": "Custom view",
  "version": "1.0.0",
  "apiVersion": 1,
  "runtime": "frontend",
  "frontend": { "entry": "ui/index.mjs", "sdk": "^0.1.0" },
  "permissions": ["ui.trusted"],
  "commands": [{ "id": "hello", "title": "Hello" }],
  "views": [{ "id": "main", "title": "Custom view", "kind": "component" }]
}
```

`ui/index.mjs` 导出 `activate(context)`，只能注册清单声明的视图和命令 ID。
激活成功后才显示视图。注册返回可重复调用的释放函数，激活可以返回可选清理函数。

```js
export function activate(context) {
  const React = context.sdk.react;
  const { Button } = context.sdk.components;
  function Counter() {
    const [count, setCount] = React.useState(0);
    return React.createElement(
      Button,
      {
        onClick: () => setCount((value) => value + 1),
      },
      `Count ${count}`,
    );
  }
  context.views.register("main", Counter);
  context.commands.register("hello", () => ({ text: "Hello" }));
}
```

必须使用宿主提供的 React，不要在插件中打包第二份 React、React DOM 或 JSX 运行时。
构建 JSX 时使用经典的 `React.createElement` 转换，并从 `context.sdk.react` 获取 React。
相对 ESM 导入可以加载已批准的其他 `ui/` 资源。入口使用 ASCII 字母、数字、`.`、`_`、`-`
和 `/`，以 `ui/` 开头、`.mjs` 结尾，禁止空路径段、`.` 和 `..`。

公开宿主组件包括 Button、IconButton、Field、Input、Textarea、Switch、SearchField 和
EmptyState，继承宿主主题。SearchField 预设与应用统一使用强制 `@field:value` 筛选语法。
公开 SDK 类型描述组件参数、资源作用域及前端上下文。自定义 CSS 应限定选择器范围；
此版本不隔离 DOM 或 CSS。

## 信任与生命周期

批准提示明确说明前端代码共享宿主 JavaScript 上下文，可以绕过 SDK 包装访问 DOM 和原生桥。
这是可信代码，不是沙箱。停止后会清理宿主管理的贡献并撤销模块地址与 SDK 调用，
但无法撤销任意 DOM 修改、强制打断死循环或移除已执行的 JavaScript。
需要阻止插件执行时，可使用 `--safe-mode` 或 `--restricted-mode` 启动恢复。

宿主在同一次读取中计算包摘要并捕获资源字节，批准与摘要、运行代次绑定；修改已安装文件
需要重新批准。停止、权限变化和 WebView 销毁都会撤销本地协议地址。每个插件资源限制
8 MiB，最多 16 个所有者合计 32 MiB；快照和协议请求另有并发限制。
资源使用明确的 MIME 白名单，不提供 HTML 文档。生产 CSP 允许插件本地模块协议，
不开放任意网络脚本或 blob 脚本。

`context.resources` 管理清理和异步工作。打开模块、导入及激活各有 15 秒超时，SDK 调用
和命令有 60 秒超时。取消会及时结束等待并清理晚到资源，但不撤销原生或远端副作用。
插件应响应 `context.signal`，清理定时器、事件监听等资源。

`context.api.call` 使用既有 RPC 分发、权限、输入输出限制及异步完成后的授权检查。
前端命令仍通过既有发现和快捷键机制调用。激活及渲染错误写入软件日志；激活失败时
停止插件，组件视图提供刷新恢复入口。

此 SDK 提供组件视图、命令，以及显式选择的主机列表和工作台提供者。全领域服务迁移尚未完成。

可运行的纯 ESM 示例见 [examples/trusted-ui](../examples/trusted-ui/README.zh-cn.md)。


界面替换及恢复流程见[界面提供者](ui-providers.zh-cn.md)。其余领域服务和依赖管理仍在实施。

[终端屏幕组合与有界订阅](terminal-ui.zh-cn.md)。
