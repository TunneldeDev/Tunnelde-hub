# 设置表单提供者

[English](../../en-us/development/preferences-ui.md) · [界面提供者](ui-providers.md)

受信任组件视图可声明 `provider: "preferences"`，需要 `ui.trusted` 与
`settings.read`；写入额外需要 `settings.write`。用户在界面提供者中主动选择，
安装插件不会自动替换设置表单。

视图收到 `preferences`，包含不可变页面元数据（分区、查询、仅显示修改项、
公开字段标识与文案、保存状态、页面版本）、可选的 `Fields` 插槽以及经过授权的
`schema()`、`read()`、`update(request)`。页面版本仅表示界面身份，写入必须使用
`read()` 返回的持久化版本。调用复用所选插件的 RPC 会话、权限与配额。
请在挂载后的普通 effect 中读取，不要在 render 或宿主提交前的 layout effect 中调用。
属性更新后应采用新接口引用；页面或设置变化会让旧引用失效，隐藏页面不能写入。
成功写入引起自身页面更新时仍返回已提交的快照，不会自动重试写入。

`Fields` 最多挂载一次；宿主移动原有 DOM，切换提供者、恢复原生、停止、撤权或
渲染失败时保留控件草稿。也可以省略插槽。搜索、漏斗预设、导航、配置档案、
重置按钮、保存状态、提供者选择、凭据与网络表单、快捷键冲突处理、存储迁移、
日志及更新安装入口仍由宿主管理。恢复栏可随时恢复原生控件。受信任前端共享
宿主上下文，不属于沙箱。

公开数据契约归属 `contracts/preferences/data/`，表现契约归属
`contracts/preferences/provider.ts`；运行授权适配归属 `extensions/preferences/`，
与原生表单组件、私有字段映射分开。市场 UI 与 RPC 类型从同一公开源生成。
该表现接口尚不包含插件自定义设置 Schema 与迁移能力。
