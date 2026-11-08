# Host API v1

Generated from the host method catalogue for Tunnelde 0.26.1. All calls require an approved executable plugin, including calls without domain permissions. `host.describe()` reports the running version. Regenerate with `npm run sdk:sync -- ../Tunnelde`.

Stability is part of the compatibility contract: `stable` methods include their first host version in `since`; `experimental` methods may evolve; `deprecated` methods include migration guidance.

| Method | Permissions | Parameters | Stability | Since | Deprecated | Behavior |
| --- | --- | --- | --- | --- | --- | --- |
| `tabBar.set` | Approved execution | `{id:string,title:string,kind:button\|select\|text,priority?:number,icon?:string,command?:string,disabled?:boolean,when?:{tabKind?:string,tabId?:string},options?:{value:string,label:string}[],value?:string,placement?:leading\|trailing,group?:string,tooltip?:string,showLabel?:boolean,checked?:boolean}` | `stable` | 0.32.0-beta.6 |  | Register or replace a bounded declarative tab-bar control owned by this runtime. Defaults to own plugin views and trailing placement; when:{} targets all tabs. Groups are plugin-scoped. showLabel keeps button text alongside its icon; checked is button-only, host-rendered, and acknowledged through set. Narrow panes move controls into an accessible overflow menu. Commands must belong to this plugin. Eight items per plugin, 128 total; removed on stop or revocation. Click context is advisory, never authorization. |
| `tabBar.remove` | Approved execution | `{id:string}` | `stable` | 0.32.0-beta.6 |  | Remove this runtime's tab-bar control; return false if absent. IDs are scoped to the plugin and runtime generation. |
| `statusBar.set` | Approved execution | `{id:string,text:string,alignment?:left\|right,priority?:number,tooltip?:string,icon?:activity\|check\|alert\|info\|sync\|terminal\|cloud\|code\|plug,command?:string}` | `stable` | 0.32.0-beta.1 |  | Register or replace this runtime's status item. Eight per plugin, 128 total; plain text only. Click commands must be this plugin's non-editor, non-file-menu manifest commands. Items disappear on stop, revocation, crash or restart. |
| `statusBar.remove` | Approved execution | `{id:string}` | `stable` | 0.32.0-beta.1 |  | Remove this runtime's status item; return false when absent. IDs are scoped to the plugin and runtime generation. |
| `editor.active` | `editor.read` | `{}` | `stable` | 0.29.0-beta.2 |  | Read the active ready editor document or null. Returns tabId, documentId, version, path, name, content and dirty. Maximum UTF-8 content 128KiB. Does not read files from disk. |
| `editor.replace` | `editor.write` | `{tabId:string,documentId:string,version:number,text:string}` | `stable` | 0.29.0-beta.2 |  | Replace an open editor buffer only if the document identity and version still match. Maximum UTF-8 text 128KiB. Undoable; never saves automatically. Rejects stale, closed, loading or disconnected documents. |
| `mounts.browse` | `mounts.read` | `{sessionId:string,path?:string}` | `experimental` |  |  | Browse directories through an authenticated SFTP session for the mount chooser. |
| `mounts.open` | `mounts.write` | `{id:string}` | `experimental` |  |  | Open this plugin's mount in the system file manager. |
| `mounts.documentation` | `mounts.read` | `{}` | `experimental` |  |  | Open platform SSHFS installation instructions in the system browser. |
| `mounts.dependencies` | `mounts.read` | `{}` | `experimental` |  |  | Detect SSHFS and FUSE compatibility; never install software or drivers. |
| `mounts.list` | `mounts.read` | `{}` | `experimental` |  |  | List this plugin's own SSHFS mounts. |
| `mounts.mount` | `mounts.write` | `{sessionId:string,remotePath:string,mountPoint:string,readOnly?:boolean}` | `experimental` |  |  | Mount using an authenticated SSH subsystem and the host's proxy/jump route. Defaults read-only. |
| `mounts.unmount` | `mounts.write` | `{id:string,force?:boolean}` | `experimental` |  |  | Unmount this plugin's own SSHFS filesystem; never terminate unrelated processes. |
| `forwards.list` | `forwards.read` | `{}` | `experimental` |  |  | Read saved TCP forwarding rules and running status. |
| `forwards.save` | `forwards.write` | `{rule:ForwardRule}` | `experimental` |  |  | Create or update a validated TCP forwarding rule; active rules must be stopped first. |
| `forwards.remove` | `forwards.write` | `{id:string}` | `experimental` |  |  | Remove a saved forwarding rule and stop its active connections. |
| `forwards.start` | `forwards.write` | `{id:string,sessionId:string}` | `experimental` |  |  | Start a saved forward through its host's active authenticated session; stopped on plugin revocation. |
| `forwards.stop` | `forwards.write` | `{id:string}` | `experimental` |  |  | Stop a forwarding listener and its active connections. |
| `runners.deploy` | `ssh.exec`, `fs.read`, `sftp.write` | `{sessionId:string,platform:posix\|windows,directory:string,runnerPath:string,executable:string}` | `experimental` |  |  | After explicit confirmation, deploy an optional selected native helper and this plugin into a fresh user directory. Never install Node or modify services. |
| `runners.start` | `ssh.exec` | `{sessionId:string,directory:string,config:object,secrets?:object}` | `experimental` |  |  | Start a durable plugin runner using a previously approved deployment; secrets travel over SSH stdin, not files or argv. |
| `runners.list` | `ssh.exec` | `{}` | `experimental` |  |  | Read this plugin's durable runner records, including stopPending for unreachable revoked tasks. |
| `runners.send` | `ssh.exec` | `{sessionId:string,runnerId:string,message:object}` | `experimental` |  |  | Enqueue an RPC request or approval response for this plugin's own remote runner. |
| `runners.poll` | `ssh.exec` | `{sessionId:string,runnerId:string,afterSeq?:number}` | `experimental` |  |  | Read sequenced durable runner events and pending approvals after reconnect. |
| `runners.status` | `ssh.exec` | `{sessionId:string,runnerId:string}` | `experimental` |  |  | Read this plugin's remote runner status. |
| `runners.stop` | `ssh.exec` | `{sessionId:string,runnerId:string}` | `experimental` |  |  | Persist and request stopping a remote runner; does not claim that an unreachable process has stopped. |
| `events.publish` | Approved execution | `{event:string,payload:JSON}` | `experimental` |  |  | Publish a bounded plugin-identified UI event; the host supplies identity and runtime generation. |
| `secrets.get` | `secrets` | `{key:string}` | `experimental` |  |  | Read this plugin's own OS-keyring secret; return string or null. Never exposes SSH credentials. |
| `secrets.set` | `secrets` | `{key:string,value:string}` | `experimental` |  |  | Store this plugin's own secret in the operating system keyring, at most 16KiB. |
| `secrets.delete` | `secrets` | `{key:string}` | `experimental` |  |  | Delete this plugin's own keyring secret. |
| `tasks.start` | Approved execution | `{executable:string,args?:string[],cwd?:string,sessionId?:string,platform?:posix\|windows,timeoutMs?:number}` | `experimental` |  |  | Start an explicitly selected executable; requires process.exec locally or ssh.exec remotely. Return taskId. Separate bounded stdout/stderr; default 30 minutes, maximum 24 hours. |
| `tasks.list` | Approved execution | `{}` | `experimental` |  |  | List this runtime's own background processes. |
| `tasks.status` | Approved execution | `{taskId:string}` | `experimental` |  |  | Read this runtime's own process status and exit code. |
| `tasks.readOutput` | Approved execution | `{taskId:string,afterSeq?:number}` | `experimental` |  |  | Read bounded sequenced stdout/stderr events; truncated reports expired output. |
| `tasks.write` | Approved execution | `{taskId:string,data:string}` | `experimental` |  |  | Write UTF-8 to this runtime's own process stdin; at most 128KiB. |
| `tasks.closeInput` | Approved execution | `{taskId:string}` | `experimental` |  |  | Close this runtime's own process stdin. |
| `tasks.cancel` | Approved execution | `{taskId:string}` | `experimental` |  |  | Stop this runtime's own process; local process trees are terminated, remote server signal support may vary. |
| `tools.invoke` | Approved execution | `{method:string,params:object,mode:ask\|approve\|full\|readOnly,scope:{sessionIds?:string[],hostIds?:string[],localRoots?:string[],remoteRoots?:{sessionId:string,path:string}[]},review?:{approved:boolean,reason:string},clientId?:string,requestId?:string}` | `experimental` |  |  | Execute an allowlisted AI/MCP tool after permission, target scope and approval checks. ReadOnly rejects every command and mutation. Review may only be supplied by a trusted plugin's independent reviewer. |
| `tools.cancel` | Approved execution | `{requestId:string}` | `experimental` |  |  | Cancel this plugin runtime's pending tool invocation; already completed operations cannot be rolled back. |
| `tools.revokeClient` | Approved execution | `{clientId:string}` | `experimental` |  |  | Cancel pending tool invocations owned by this plugin runtime's client. |
| `api.describe` | Approved execution | `{}` | `stable` | 0.21.0 |  | List the fixed versioned host API; every request still checks runtime authorization. |
| `log` | `log` | `{message:string,level?:string}` | `experimental` |  |  | Write a bounded plugin-tagged log message. |
| `app.info` | `app.read` | `{}` | `experimental` |  |  | Read application metadata, platform and preference schema; no credentials. |
| `app.openExternal` | `app.openExternal` | `{url:string}` | `experimental` |  |  | Open an http/https URL with the system browser. |
| `settings.get` | `settings.read` | `{}` | `experimental` |  |  | Read application preferences. |
| `settings.update` | `settings.write` | `{patch:object}` | `experimental` |  |  | Update and sanitize preferences through the normal settings service. |
| `hosts.snapshot` | `hosts.read` | `{}` | `experimental` |  |  | Read saved host and group metadata; authentication secrets are never returned. |
| `hosts.create` | `hosts.write` | `{input:HostInput}` | `experimental` |  |  | Create a validated saved host. |
| `hosts.update` | `hosts.write` | `{id:string,input:HostInput}` | `experimental` |  |  | Replace a saved host's validated metadata. |
| `hosts.delete` | `hosts.write` | `{id:string}` | `experimental` |  |  | Delete a saved host and forget its stored credential. |
| `hosts.markUsed` | `hosts.write` | `{id:string}` | `experimental` |  |  | Update a saved host's last-used time. |
| `hosts.reorder` | `hosts.write` | `{ids:string[]}` | `experimental` |  |  | Persist the order of saved hosts; at most 500 IDs. |
| `groups.create` | `hosts.write` | `{input:GroupInput}` | `experimental` |  |  | Create a validated host group. |
| `groups.update` | `hosts.write` | `{id:string,input:GroupInput}` | `experimental` |  |  | Update a validated host group. |
| `groups.delete` | `hosts.write` | `{id:string}` | `experimental` |  |  | Delete a host group through the normal group service. |
| `sessions.list` | `sessions.read` | `{}` | `stable` | 0.21.0 |  | List active SSH session metadata; no passwords or private keys. |
| `sessions.connect` | `ssh.exec` | `{request:SshConnectRequest}` | `experimental` |  |  | Connect a saved host with normal host-key verification; never auto-trust a server. |
| `sessions.disconnect` | `ssh.exec` | `{sessionId:string}` | `experimental` |  |  | Disconnect an active SSH session. |
| `sessions.exec` | `ssh.exec` | `{sessionId:string,command:string,timeoutMs?:number}` | `experimental` |  |  | Execute in a separate SSH channel; return stdout/stderr/exitCode/signal. Timeout 100–60000ms, output at most 1MiB. |
| `terminal.write` | `ssh.exec` | `{sessionId:string,data:string}` | `experimental` |  |  | Write plain UTF-8 terminal input, including remote shell commands; the host handles transport encoding. |
| `terminal.resize` | `ssh.exec` | `{sessionId:string,cols:number,rows:number}` | `experimental` |  |  | Resize the remote terminal through the validated session service. |
| `files.local.home` | `fs.read` | `{}` | `experimental` |  |  | Read the local home directory path. |
| `files.local.list` | `fs.read` | `{path?:string}` | `experimental` |  |  | List a local directory. |
| `files.local.readText` | `fs.read` | `{path:string}` | `experimental` |  |  | Read a UTF-8 local text file, at most 512KiB; reject binary data. |
| `files.local.writeText` | `fs.write` | `{path:string,content:string,baseline?:string}` | `experimental` |  |  | Atomically replace existing local UTF-8 text, at most 512KiB; optional baseline detects external edits. |
| `files.local.createFile` | `fs.write` | `{path:string}` | `experimental` |  |  | Create an empty local file without replacing an existing file. |
| `files.local.mkdir` | `fs.write` | `{path:string}` | `experimental` |  |  | Create a local directory. |
| `files.local.rename` | `fs.write` | `{from:string,to:string,overwrite?:boolean}` | `experimental` |  |  | Rename a local file or directory; overwriting is opt-in. |
| `files.local.copy` | `fs.read`, `fs.write` | `{from:string,to:string,overwrite?:boolean}` | `experimental` |  |  | Copy local files/directories through the existing copy service. |
| `files.local.delete` | `fs.write` | `{path:string,isDir:boolean}` | `experimental` |  |  | Delete a local file or directory. |
| `files.sftp.list` | `sftp.read` | `{sessionId:string,path?:string}` | `experimental` |  |  | List a remote directory using an active SSH session. |
| `files.sftp.resolveDirectory` | `sftp.read` | `{sessionId:string,path?:string}` | `experimental` |  |  | Resolve the SSH account home and an optional working directory through SFTP without listing entries or executing a shell. Return {home,path}. Supports ~ and relative paths. |
| `files.sftp.readText` | `sftp.read` | `{sessionId:string,path:string}` | `experimental` |  |  | Read remote UTF-8 text through the editor service; API response size limits apply. |
| `files.sftp.writeText` | `sftp.write` | `{sessionId:string,path:string,content:string,baseline?:string}` | `experimental` |  |  | Atomically replace existing remote text; optional baseline detects external edits. |
| `files.sftp.createFile` | `sftp.write` | `{sessionId:string,path:string}` | `experimental` |  |  | Create an empty remote file without replacing an existing file. |
| `files.sftp.mkdir` | `sftp.write` | `{sessionId:string,path:string}` | `experimental` |  |  | Create a remote directory. |
| `files.sftp.rename` | `sftp.write` | `{sessionId:string,from:string,to:string,overwrite?:boolean}` | `experimental` |  |  | Rename a remote file/directory; overwriting is opt-in. |
| `files.sftp.copy` | `sftp.read`, `sftp.write` | `{sessionId:string,from:string,to:string,overwrite?:boolean}` | `experimental` |  |  | Copy remote files/directories within a session. |
| `files.sftp.delete` | `sftp.write` | `{sessionId:string,path:string,isDir:boolean}` | `experimental` |  |  | Delete a remote file or directory. |
| `files.upload` | `fs.read`, `sftp.write` | `{sessionId:string,localPath:string,remotePath:string,overwrite?:boolean}` | `experimental` |  |  | Copy a local file or directory to a remote path. Return transferId; cancellation, progress and file refresh use the normal transfer service. Revoking access or stopping this runtime cancels its active transfers. |
| `files.download` | `sftp.read`, `fs.write` | `{sessionId:string,remotePath:string,localPath:string,overwrite?:boolean}` | `experimental` |  |  | Copy a remote file or directory to a local path. Return transferId; never remove the source. Revoking access or stopping this runtime cancels its active transfers. |
| `files.cancelTransfer` | Approved execution | `{transferId:string}` | `experimental` |  |  | Cancel only a transfer owned by this plugin's current runtime. Return true if its active transfer was found; false for completed, missing or other owners' transfers. |
| `files.transferStatus` | Approved execution | `{transferId:string}` | `experimental` |  |  | Read progress or the final TransferEvent for this runtime's own transfer; return null for missing, other-owner or expired IDs. The latest 256 completed plugin transfers are retained in memory. |
| `monitor.system` | `monitor.read` | `{}` | `experimental` |  |  | Read local CPU, memory, disk and network statistics. |
| `monitor.stats` | `monitor.read` | `{sessionId:string}` | `experimental` |  |  | Sample remote system statistics. |
| `monitor.processes` | `monitor.read` | `{sessionId:string}` | `experimental` |  |  | List remote processes. |
| `monitor.kill` | `monitor.write` | `{sessionId:string,pid:number}` | `experimental` |  |  | Send TERM to a remote process; protected process validation still applies. |
| `history.list` | `history.read` | `{hostId:string,limit?:number}` | `experimental` |  |  | Read saved command history, at most 500 rows. |
| `history.record` | `history.write` | `{hostId:string,command:string}` | `experimental` |  |  | Record a command for an existing saved host. |
| `history.delete` | `history.write` | `{id:number}` | `experimental` |  |  | Delete one command-history entry. |
| `history.clear` | `history.write` | `{hostId:string}` | `experimental` |  |  | Clear a saved host's command history. |
| `workspace.snapshot` | `workspace.read` | `{}` | `stable` | 0.21.0 |  | Read a detached v1 snapshot of live tabs, panes, active IDs and split layout, including hidden panels and file-pane metadata. No file contents, credentials or arbitrary store fields. Tab kinds and file-view option values are open vocabularies; tolerate unfamiliar values. The snapshot neither reserves resources nor grants their permissions. |
| `workspace.openPage` | `workspace.write` | `{kind:welcome\|settings\|about\|updates\|knownHosts}` | `experimental` |  |  | Open or focus an existing application page. |
| `workspace.openHost` | `workspace.write`, `hosts.read` | `{hostId:string}` | `experimental` |  |  | Open a saved host's details; never reveal an authentication secret. |
| `workspace.openTerminal` | `workspace.write`, `sessions.read` | `{sessionId:string}` | `experimental` |  |  | Open a terminal tab for an already-connected session. |
| `workspace.openFiles` | `workspace.write`, `sessions.read` | `{sessionId:string}` | `experimental` |  |  | Open a file browser for an already-connected session. |
| `workspace.openSidebar` | `workspace.write` | `{view:hosts\|plugins\|knownHosts}` | `experimental` |  |  | Dock a list into the current workspace group. |
| `workspace.activate` | `workspace.write` | `{tabId:string}` | `experimental` |  |  | Activate an existing tab and its group. |
| `workspace.close` | `workspace.write` | `{tabId:string}` | `experimental` |  |  | Close a tab; dirty editors retain the normal user confirmation. Result reports pending confirmation. |
| `workspace.split` | `workspace.write` | `{tabId:string,direction:row\|column,position?:before\|after,targetPaneId?:string}` | `experimental` |  |  | Move a tab into a split group. |
| `workspace.move` | `workspace.write` | `{tabId:string,paneId:string,beforeTabId?:string\|null}` | `experimental` |  |  | Move or reorder an existing tab. |
| `workspace.showQuickAccess` | `workspace.write` | `{query?:string}` | `experimental` |  |  | Open Quick Access with an optional query. Never execute a command automatically. |
| `workspace.setPaneLocked` | `workspace.write` | `{paneId:string,locked:boolean}` | `experimental` |  |  | Set the destination lock on an existing pane. |
| `workspace.resizeSplit` | `workspace.write` | `{splitId:string,ratio:number}` | `experimental` |  |  | Resize an existing split with a ratio between 0.1 and 0.9. |
| `workspace.returnSidebar` | `workspace.write` | `{view:hosts\|plugins\|knownHosts}` | `experimental` |  |  | Return a docked list to the sidebar. |
| `clipboard.readText` | `clipboard.read` | `{}` | `experimental` |  |  | Read the system text clipboard. |
| `clipboard.writeText` | `clipboard.write` | `{text:string}` | `experimental` |  |  | Replace the system text clipboard. |
| `storage.get` | Approved execution | `{key:string}` | `stable` | 0.21.0 |  | Read plugin-scoped JSON data. Keys use 1–128 ASCII letters, digits, dot, hyphen or underscore. |
| `storage.set` | Approved execution | `{key:string,value:JSON}` | `stable` | 0.21.0 |  | Persist plugin-scoped JSON data, at most 256KiB total per plugin. |
| `storage.delete` | Approved execution | `{key:string}` | `stable` | 0.21.0 |  | Remove a key from plugin-scoped JSON data. |
| `ui.showMessage` | Approved execution | `{message:string,kind?:info\|success\|error}` | `experimental` |  |  | Show a bounded notification prefixed with the installed plugin's identity. |
| `ui.confirm` | Approved execution | `{message:string}` | `experimental` |  |  | Ask the user a plugin-identified confirmation; never replace an existing dialog. |
