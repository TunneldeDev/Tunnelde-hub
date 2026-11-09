# 可信界面示例

[English](README.en-us.md)

在扩展目录声明支持 UI SDK 0.1.0 的宿主中，通过本地安装选择此目录。
使用活动栏图标或 F1 打开 **UI example**。批准前请阅读可信代码提示：
模块共享宿主 JavaScript 上下文及原生桥，不是沙箱。无需 Node 或外部账号。

计数器演示共享 React hooks 和宿主 Field、Input、Button 组件；清单中的 `hello`
命令也可通过 F1 和既有快捷键注册机制使用。示例采用纯 ESM，无需构建工具。
类型由 `sdk/tunnelde-ui.d.mts` 提供，不导入宿主内部源码。

构建 JSX 时使用经典的 `React.createElement` 转换，并从 `context.sdk.react` 获取
React，不要打包第二份 React、React DOM 或 JSX 运行时。停止插件会移除视图和命令；
如果可信前端导致宿主无法响应，可使用受限模式重启恢复。
