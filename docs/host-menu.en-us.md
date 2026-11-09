# Host menu contributions

[简体中文](host-menu.zh-cn.md) · [Frontend UI](frontend-ui.en-us.md)

Set `hostMenu: true` on a manifest command and declare `hosts.read`. The host
adds the command, with its plugin name, to saved-host right-click and more menus.
The experimental `hostList.menu` directory point describes this manifest extension;
check `extensions.describe()` before depending on it. Older hosts ignore the
new metadata. Declare an application engine range once a supporting version ships.

```json
{
  "permissions": ["hosts.read"],
  "commands": [{ "id": "inspect", "title": "Inspect host", "hostMenu": true }]
}
```

The command receives `HostMenuCommandInput` from `sdk/tunnelde-plugin.d.mts`:
`host: { id, name, address, port, username, groupId, tags }`. This DTO is generated
from the host projection and checked for drift. It excludes passwords, key paths,
notes and internal state. The context is advisory; subsequent APIs still require
their own permissions and valid runtime. The host rejects removed or modified
targets after permission prompts and discards stale plugin output.

There are at most 16 actions per plugin, 128 displayed overall. Titles have at most
120 Unicode characters, without control characters. A host command cannot also be
an editor or file-menu command. Actions combine by plugin ID and manifest order;
they cannot replace built-in actions. Palette and shortcut invocation use the host
associated with the active tab; no target produces an explanatory message.

Node, WASM and trusted frontend commands use the same flow. A frontend module
registers the declared command with `context.commands.register`. Installation and
menu display do not implicitly authorize Node or start code. See the
[`examples/trusted-ui`](../examples/trusted-ui) source for a working handler.
