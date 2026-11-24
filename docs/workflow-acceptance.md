# Plugin contribution workflow acceptance / 插件贡献流程验收

Run on 2026-11-24 (Asia/Shanghai). The production refactor was merged in [Hub PR #118](https://github.com/TunneldeDev/Tunnelde-hub/pull/118).

## Scope / 范围

The acceptance uses two isolated public repositories: a plugin created with GitHub **Use this template**, and a copy of Hub with the same validation, archive audit, update and PR-policy workflows. The fixture plugin is never registered in the production Hub. Acceptance repositories are archived after the run to retain evidence without scheduled jobs.

本次使用隔离的插件仓库与 Hub 验收仓库，实际运行 GitHub 发布、首次收录及更新 PR 流程。Hub 验收仓库使用与正式 Hub 相同的工作流；测试插件不会加入正式市场。验收后归档两个测试仓库，保留记录并停止定时任务。

## Evidence / 验收记录

| Check / 检查 | Evidence / 记录 |
| --- | --- |
| Fresh template initialization, build, protocol tests and release of v1.0.0 | [Release run](https://github.com/TunneldeDev/Tunnelde-plugin-workflow-acceptance/actions/runs/45308186334) |
| First registration using downloaded marketplace.json; Node 22/24, archive audit and PR-title checks | [Registration PR #3](https://github.com/TunneldeDev/Tunnelde-hub-workflow-acceptance/pull/3) |
| Independent release of v1.0.1 | [Release run](https://github.com/TunneldeDev/Tunnelde-plugin-workflow-acceptance/actions/runs/45308423543) |
| Repeating the same immutable release verifies existing assets without replacing them | [Repeated release run](https://github.com/TunneldeDev/Tunnelde-plugin-workflow-acceptance/actions/runs/45308561877) |
| Actual update discovery creates a review PR and explicitly dispatches validation | [Discovery run](https://github.com/TunneldeDev/Tunnelde-hub-workflow-acceptance/actions/runs/45308566610) · [Update PR #4](https://github.com/TunneldeDev/Tunnelde-hub-workflow-acceptance/pull/4) |
| Tag/package version mismatch is rejected before publishing (expected failure) | [Negative release test](https://github.com/TunneldeDev/Tunnelde-plugin-workflow-acceptance/actions/runs/45308635840) |
| Re-running discovery updates the same review PR rather than creating duplicates | [Repeated discovery](https://github.com/TunneldeDev/Tunnelde-hub-workflow-acceptance/actions/runs/45308727085) |
| Protected update PR validation after first-run approval | [PR validation](https://github.com/TunneldeDev/Tunnelde-hub-workflow-acceptance/actions/runs/45308628971) |
| After merging, discovery finds no updates and creates no review PR | [No-update run](https://github.com/TunneldeDev/Tunnelde-hub-workflow-acceptance/actions/runs/45309226909) |
| Template regression acceptance on Node 22/24 | [Template PR #1](https://github.com/TunneldeDev/Tunnelde-plugin-template/pull/1) |

Both actual published ZIPs were downloaded and checked against marketplace SHA-256 and SHA256SUMS. Their verified contents were installed in temporary directories and exercised over real stdio outside the source repository, without node_modules. A deliberately changed archive byte was rejected by the verifier.

两个真实发布 ZIP 均已下载并核对市场元数据和校验文件，校验后在独立临时目录启动真实协议进程；损坏包被正确拒绝。模板的 `npm run verify:template` 将初始化、构建、协议测试、重复打包一致性、包校验及独立安装运行纳入 Node 22/24 CI，并验证开发者初始化插件后，继承的 CI 不会重复初始化。

## First-run approval / 首次运行审批

The update bot's first PR produced a `pull_request` run awaiting GitHub workflow approval. Explicit `workflow_dispatch` runs passed on the head commit, but with the same four required checks as production and administrator enforcement enabled, branch protection correctly refused the merge. A maintainer approved the pending PR workflow through GitHub's run-approval endpoint. After approval, the normal PR validation passed and the update was merged without an administrator bypass. The merged registry advertises version 1.0.1. This setup case is part of the contribution guides; do not bypass protection or automatically approve unreviewed contributor code.

更新机器人第一次提交 PR 时，GitHub 要求批准工作流。实际开启正式 Hub 的四项必需检查并对管理员生效后，未审批时合并被正确阻止；维护者审核后批准了待运行的 PR 工作流。批准后，正常 PR 校验全部通过，在未绕过管理员保护的情况下完成合并，合并后的索引提供 v1.0.1。这个首次接入步骤已写入贡献指南。

## Future contributions / 后续贡献

Follow [the contribution guide](../CONTRIBUTING.md) / [中文贡献指南](../CONTRIBUTING.zh-cn.md). Plugin repositories own their build and release checks. Hub reviews metadata and downloads published archives; it does not build or execute submitted plugins.

This acceptance exercises GitHub workflows, registry consumption and an installed plugin protocol process. It does not replace each plugin's feature tests, permission review or manual installation checks in the Tunnelde UI. Fork-origin PRs and the timed scheduler itself are not exercised here; update discovery is invoked through the workflow's manual dispatch event.

本次验收覆盖 GitHub 工作流、生成索引和安装包协议运行；各插件仍需自己的功能测试、权限审核和 Tunnelde 界面安装验证。本次首次收录通过同仓库分支 PR 测试，更新使用手动触发，未模拟外部 fork PR 或等待每日定时调度。
