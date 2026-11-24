# 为 Tunnelde Hub 贡献插件

[简体中文](CONTRIBUTING.zh-cn.md) · [English](CONTRIBUTING.md)

所有新插件及后续版本都遵循“独立仓库开发与发布 → Hub 审核收录 → 更新 PR 审核”的流程。Hub 只维护插件索引和经过校验的发布链接。插件代码、构建、测试及发布均由插件自己的仓库负责。

## 1. 创建并验证插件

推荐在[模板仓库](https://github.com/TunneldeDev/Tunnelde-plugin-template)点击 **Use this template**，然后在创建的仓库中运行：

```sh
npm ci --ignore-scripts
npm run init -- my-plugin "My Plugin" my-account my-repository
npm run build
npm run verify
npm run package
```

实现功能并完善清单、README 和许可证，说明宿主与运行环境最低版本、所需权限及数据访问行为。将 `artifacts/<id>-<version>.zip` 导入 Tunnelde，验证实际安装包可以使用。运行依赖必须随包提供，安装时不得运行脚本或额外下载依赖。

已有独立仓库可以继续使用，但必须提供等效的构建、测试、打包及不可变发布检查。SDK 和协议文档见[开发指南](https://github.com/TunneldeDev/Tunnelde-plugin-sdk)。

## 2. 从插件仓库发布

保持 `package.json`、锁文件与 `tunnelde-plugin.json` 的版本一致，提交后推送匹配的版本标签，例如：

```sh
git tag v1.0.0
git push origin v1.0.0
```

模板的 **Release** 工作流会检查标签和版本，安装构建依赖、构建、测试、打包，并发布到插件自己的 GitHub Release：

- `<id>-<version>.zip`：完整安装包。
- `marketplace.json`：市场元数据、下载链接及 SHA-256。
- `SHA256SUMS`：压缩包校验值。

发布器会重新下载远端文件并比对内容。确认 Release 工作流成功且版本已正式发布；仅通过普通 CI 或生成 Actions 构建产物不代表发布完成。

## 3. 首次向 Hub 申请收录

先完成真实发布，从该 Release 下载 `marketplace.json`（使用发布产物中的校验值），再向 Hub 提交 PR，新增 `catalogue/<id>.json`：

```json
{
  "repository": "my-account/my-repository",
  "channel": "stable",
  "entry": {
    "这里替换为": "已发布 marketplace.json 的完整内容"
  }
}
```

每个仓库对应一个插件身份。默认使用 `stable`，需要展示预发布版本时才使用 `prerelease`。不得填写未发布的资源或自行编造校验值。

在 Hub 中运行并提交生成的索引：

```sh
npm ci --ignore-scripts
npm run registry
npm run verify
npm run audit
```

PR 需说明功能、权限与验证结果，标题采用 Conventional Commits 格式，例如 `feat(catalogue): add my-plugin`。通过校验和审核后以 squash 方式合并，插件才进入正式索引。Hub 检查真实下载内容、SHA-256、包身份、清单、README、许可证和必需入口，拒绝不安全路径与符号链接。

## 4. 发布后续版本

在插件仓库增加版本并推送新标签。Hub 每日运行 **Discover plugin updates**，发现并验证新版后创建或更新审核 PR；也可以手动运行该工作流，或在 Hub 执行 `npm run updates`。更新必须经审核合并，不会自动进入市场。

已有版本的文件内容、下载地址及校验值保持不变。修改插件必须发布更高版本，不得覆盖旧发布。历史 Hub 发布继续保留原地址和校验值。

## 维护模板与验收流程

修改模板本身时运行 `npm run verify:template`。模板 CI 在 Node 22/24 上初始化独立插件、安装构建依赖、构建测试、比对重复打包结果，校验 ZIP 后在没有构建依赖的安装目录启动真实协议进程。

完整的 GitHub 发布与 Hub 更新 PR 验收记录见[工作流验收](docs/workflow-acceptance.md)。
