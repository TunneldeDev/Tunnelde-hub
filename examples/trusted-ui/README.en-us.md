# Trusted UI example

[简体中文](README.zh-cn.md)

Use local plugin installation to select this directory on a host advertising UI
SDK 0.1.0. Open **UI example** from its activity icon or F1. Review the explicit
trusted-code approval: the module shares the host JavaScript context and native
bridge and is not sandboxed. It does not need Node or an external account.

The counter demonstrates shared React hooks and host Field, Input and Button
components. The declared `hello` command is also available through F1 and normal
shortcut registration. The example is plain ESM and requires no build tool.
Types are supplied in `sdk/tunnelde-ui.d.mts`; no internal host imports are used.

For JSX, configure classic `React.createElement` transformation and obtain React
from `context.sdk.react`. Never include a second React, React DOM or JSX runtime.
Stop the plugin to remove its views and commands. Restart in restricted mode if
trusted frontend code prevents the host from responding.
