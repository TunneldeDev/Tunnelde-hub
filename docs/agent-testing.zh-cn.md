# 原生 Agent 适配器测试

[English](agent-testing.en-us.md)

`npm test` 会运行确定性的协议测试。原生测试需要显式指定可执行文件；没有对应环境变量
时跳过，不会自动发现 Agent 或复用用户登录。构建和测试使用 Node，不代表插件获准使用
系统 Node 运行时。

Pi 适配器的测试方式：

```powershell
$env:TUNNELDE_TEST_PI = 'C:/path/to/pi.exe'
node --test tests/pi-native.test.mjs
```

```sh
TUNNELDE_TEST_PI=/path/to/pi node --test tests/pi-native.test.mjs
```

测试在已忽略的 `.tmp/qa/` 下创建独立配置、会话目录和工作目录。本机回环 HTTP 模型端
返回可控的流式消息和工具请求，验证不发送消息的协议初始化、Unicode 流式回复、跨进程
继续原生会话、工具批准与拒绝、拒绝后文件未改变、模型错误传播，以及进程清理。
每次测试的 `result.json` 留在对应临时目录中，不需要真实模型凭据或真实模型输出。

市场 CI 在 Linux 和 Windows 上使用 Pi 0.85.1 的原生发布包执行该测试，下载后先核对固定
SHA-256。模型端点和配置均由测试创建，不需要模型服务凭据，也不通过系统 Node 子进程
运行 Pi。

这些证据覆盖该版本的原生协议适配，不证明真实模型登录、SSH 传输、应用进程管理器、
桌面聊天交互或所有 Agent 版本兼容；这些仍需分别验收。不能将模拟协议或回环模型测试
通过描述为本地／远端真实认证对话已完成。
