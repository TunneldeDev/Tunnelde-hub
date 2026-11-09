# 主机菜单贡献

[English](host-menu.en-us.md) · [前端 UI](frontend-ui.zh-cn.md)

在清单命令声明 `hostMenu: true` 及 `hosts.read` 权限，宿主会将命令及插件名称
添加到已保存主机的右键菜单和更多菜单。实验扩展点 `hostList.menu` 描述该清单扩展；
依赖它前先检查 `extensions.describe()`。旧宿主会忽略新元数据，支持该功能的版本
发布后应设置对应的应用版本范围。

```json
{
  "permissions": ["hosts.read"],
  "commands": [{ "id": "inspect", "title": "检查主机", "hostMenu": true }]
}
```

命令收到 `sdk/tunnelde-plugin.d.mts` 中的 `HostMenuCommandInput`：
`host: { id, name, address, port, username, groupId, tags }`。
此 DTO 从宿主投影生成，并自动检查差异，不含密码、私钥路径、备注和内部状态。
上下文不代表授权，后续 API 仍需各自权限及有效运行实例；权限确认后，宿主会拒绝
已删除或已修改的主机，并丢弃过期插件的结果。

每插件最多 16 项，界面总计最多 128 项；标题最多 120 个 Unicode 字符，不含控制字符。
主机命令不能同时作为编辑器或文件菜单命令。菜单按插件 ID、清单顺序组合，
保留内置操作。通过命令面板和快捷键运行时采用活动标签页的主机，没有目标时显示说明。

Node、WASM 和可信前端命令采用相同流程。前端模块通过 `context.commands.register`
注册已声明命令。安装和显示菜单不会自动授权 Node 或启动代码。
完整处理示例见 [`examples/trusted-ui`](../examples/trusted-ui)。
