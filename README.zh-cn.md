# Tunnelde Hub

[简体中文](README.zh-cn.md) · [English](README.en-us.md)

[Tunnelde](https://github.com/TunneldeDev/Tunnelde) 的独立插件目录。本仓库分发**经过校验的发布链接**、版本信息和 SHA-256 校验值。插件源码、构建、测试及发布产物均由各自独立仓库维护。

Tunnelde 继续通过以下地址读取保持 v1 格式的 [registry.json](registry.json)：

```text
https://raw.githubusercontent.com/TunneldeDev/Tunnelde-hub/main/registry.json
```

## 开发插件

新插件及后续版本统一遵循[贡献与发布流程](CONTRIBUTING.zh-cn.md)：独立仓库开发和发布，首次通过 PR 收录，后续由更新 PR 审核。

打开 [Tunnelde-plugin-template](https://github.com/TunneldeDev/Tunnelde-plugin-template)，点击 **Use this template** 创建插件仓库。模板包含初始化工具、最小可用插件、固定版本的 SDK、真实协议测试、可复现打包流程和独立 CI/CD。

[版本化 SDK 与开发指南](https://github.com/TunneldeDev/Tunnelde-plugin-sdk) 在独立仓库维护。AI 集成插件可以使用[共享助手运行时](https://github.com/TunneldeDev/Tunnelde-assistant-runtime)；各插件固定构建依赖版本，并在发布包中包含完整运行所需内容。

[语法高亮插件](https://github.com/TunneldeDev/Tunnelde-plugin-syntax-highlighting) 为常见代码和配置文件提供离线高亮，支持本地及 SSH 编辑器缓冲区。插件内置 TextMate 语法和 WASM，颜色由 Tunnelde 主题提供。安装后启动插件并授权 `editor.read` 即可使用。此插件的功能范围为语法高亮，不包含语言服务器、代码补全或诊断。

## 插件目录

每条 [catalogue/](catalogue/) 记录声明插件源码仓库、发布通道和经过审核的应用索引条目。反馈问题或贡献代码时，请前往对应插件仓库。Hub 不引入 Git 子模块或插件源码副本，也不承担插件构建或新版本发布。

| 文件 | 职责 |
| --- | --- |
| `catalogue/<id>.json` | 已注册仓库、稳定版或预发布策略及固定的版本元数据 |
| `registry.json` | 生成的应用插件索引，保持 v1 数据格式 |
| `scripts/validate.mjs` | 离线校验元数据并生成可复现的索引 |
| `scripts/audit.mjs` | 下载并校验已发布的压缩包，无需解压到文件系统 |
| `scripts/update.mjs` | 发现新版本，校验每项候选更新后更新元数据 |

通过 Tunnelde 的插件市场安装插件。下载内容必须与索引中固定的 SHA-256 一致。安装时不会运行 npm 或下载运行时依赖。可执行插件需要其声明的运行环境与权限。校验值用于确认文件内容一致；发布者的可信度仍需单独判断。

## 维护目录

需要 Node.js 22 或更高版本：

```sh
npm ci --ignore-scripts
npm run registry       # 根据经过审核的元数据重新生成 registry.json
npm run verify         # 离线校验与测试
npm run audit          # 校验已发布的 ZIP 及包内清单、许可证
npm run updates        # 发现并校验已发布的新版本
```

每个插件仓库独立发布 `vX.Y.Z` 版本，包含 `<id>-<version>.zip`、`marketplace.json` 和 `SHA256SUMS`。Hub 检查压缩包校验值、路径安全性、包身份、清单元数据和必需的入口文件，不执行下载的插件。

每日运行的 **Discover plugin updates** 工作流会创建或更新一个供审核的 PR，并显式触发校验，不会自动合并。仓库的 Actions 设置需要允许 GitHub Actions 创建 PR。稳定版记录忽略预发布版本；预发布记录接受两个通道的版本。新增插件仓库需要手动注册并审核。

已有版本保留原始下载地址和校验值。历史 `plugins-v*` Hub 发布继续可用，插件后续版本由各自仓库发布。插件 ID、配置和密钥命名空间保持一致。详情见[迁移说明](docs/migration.md)和[贡献指南](CONTRIBUTING.zh-cn.md)。

## 许可证

GPL-3.0-only，详见 [LICENSE](LICENSE)。各插件仓库在发布包内提供其适用的许可证与第三方声明。
