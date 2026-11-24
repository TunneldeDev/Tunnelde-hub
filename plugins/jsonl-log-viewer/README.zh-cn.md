# JSONL Log Viewer

在 Tunnelde 编辑器打开 `.jsonl` 或 `.ndjson` 文件，按 **Ctrl+Shift+F**
（macOS 为 **Cmd+Shift+F**），或在 F1 选择 **JSONL: Convert to readable log**。
插件直接转换当前编辑缓冲区，可以撤销，不自动保存。
建议另存为 `.log`，保留原始结构化日志。

支持 Tunnelde/Rust tracing 的 fields、常见时间/级别/消息字段和数字级别。
保留原始时间戳、其他元数据与大整数，缩进多行消息并转义终端控制字符。
存在无效 JSON 或非对象行时停止编辑器转换，不修改原文；插件页面可选的
片段预览会保留异常原文并显示行号。不会执行日志内容、读取磁盘或联网发送数据。

输入最多 128 KiB，输出最多 256 KiB，大日志可选取片段。
快捷键冲突使用宿主通常的冲突对话框和快捷键设置处理。
`editor.read` 与 `editor.write` 用于当前编辑文档。此为可执行 Node 插件，
需要批准插件及明确授权 Node 22+ 运行时。应用不自带 Node，不会静默安装运行时。
卸载后相应命令和快捷键消失。
