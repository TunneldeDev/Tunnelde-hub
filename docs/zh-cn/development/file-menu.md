# 文件右键菜单扩展

此接口仍在开发，尚未包含在已发布的 Tunnelde 版本中。发布使用此接口的插件之前，请确认宿主发布版本，并在 `engines.tunnelde` 中声明最低支持版本。

可执行插件可以为用户选中的文件或文件夹注册命令：

```json
{
  "permissions": ["fs.read", "sftp.read"],
  "commands": [
    {
      "id": "inspect",
      "title": "检查文件",
      "fileMenu": {
        "sources": ["local", "remote"],
        "kinds": ["file"],
        "extensions": ["json", "tar.gz"]
      }
    }
  ]
}
```

`sources` 和 `kinds` 均须非空且不能重复。本地来源需要 `fs.read`，远端来源需要 `sftp.read`；不需要的来源及权限可以省略。`extensions` 是可选的文件后缀过滤，不含开头的点，匹配时不区分大小写，对文件夹不生效。最多提供 64 个后缀，每个最多 64 个 ASCII 字母、数字、点、下划线或连字符。省略或传入空列表时匹配所有文件。

在运行时及权限获得批准后，命令收到 `file: {path, name, isDirectory, source}`。`source` 为 `{kind: "local"}` 或 `{kind: "remote", sessionId}`。上下文指向用户右键调用的项目，不代表批量选择。它不会绕过插件已有的权限或文件访问范围。命令可返回 `{text: string}`，由宿主显示在命令输出视图中。声明式插件和主题插件不能注册可执行命令。

输出视图最多接受 1 MiB 的 UTF-8 文本。运行时传输和 JSON 序列化也有大小限制，因此实际可用文本长度可能更小，尤其是包含需要 JSON 转义的字符时。超限结果会报错，不会被静默截断。

[English](../../en-us/development/file-menu.md)

挂载提供方（包括声明式插件）还可以在清单根部声明 `"mountedFileReveal": true`，并同时申请 `mounts.read` 和 `mounts.write`。宿主仅在插件自己的有效挂载覆盖所选 SSH 会话及路径时提供原生文件管理器入口，执行时会再次检查归属和授权。
