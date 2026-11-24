# 主机元数据示例

在实现实验扩展 `hosts.fields` 的宿主中，将此目录作为本地插件安装。打开已保存主机的详情，展开 **插件主机字段 → Host metadata example**，即可编辑和保存字段，无需启动插件或授予运行权限，也不需要 Node。

主机菜单命令 **Toggle managed flag** 是可执行的可信前端代码，运行前需明确批准 `ui.trusted`、`hosts.read`、`hosts.write`。可信代码在应用上下文中运行，没有沙箱。命令先读取本插件的文档，再用观察到的修订号和结构摘要保存；并发变化或结构不兼容时明确失败，不自动重复覆盖。停止或卸载保留值，删除主机时删除文档。请勿在元数据中填写敏感信息。

参见[字段契约](../../docs/zh-cn/development/host-fields.md)。此示例属于开发资料，不是市场安装包。

**Show budget column** 额外需要 `workspace.write` 和实验扩展 `hostList.columns`，展示选中主机的数值预算，保留零值；未设置时发布空列。将主机面板切换为表格即可查看，停止插件会移除该列。参见[主机列扩展](../../docs/zh-cn/development/host-columns.md)。
