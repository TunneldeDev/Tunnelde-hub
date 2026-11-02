# Host API v1

Generated from the host method catalogue for Tunnelde 0.25.1. All calls require an approved executable plugin, including calls without domain permissions. `host.describe()` reports the running version. Regenerate with `npm run sdk:sync -- ../Tunnelde`.

| Method | Permissions | Parameters | Behavior |
| --- | --- | --- | --- |
| `runners.deploy` | `ssh.exec`, `fs.read`, `sftp.write` | `{sessionId:string,platform:posix\|windows,directory:string,runnerPath:string,executable:string}` | After explicit confirmation, deploy an optional selected native helper and this plugin into a fresh user directory. Never install Node or modify services. |
| `runners.start` | `ssh.exec` | `{sessionId:string,directory:string,config:object,secrets?:object}` | Start a durable plugin runner using a previously approved deployment; secrets travel over SSH stdin, not files or argv. |
| `runners.list` | `ssh.exec` | `{}` | Read this plugin's durable runner records, including stopPending for unreachable revoked tasks. |
| `runners.send` | `ssh.exec` | `{sessionId:string,runnerId:string,message:object}` | Enqueue an RPC request or approval response for this plugin's own remote runner. |
| `runners.poll` | `ssh.exec` | `{sessionId:string,runnerId:string,afterSeq?:number}` | Read sequenced durable runner events and pending approvals after reconnect. |
| `runners.status` | `ssh.exec` | `{sessionId:string,runnerId:string}` | Read this plugin's remote runner status. |
| `runners.stop` | `ssh.exec` | `{sessionId:string,runnerId:string}` | Persist and request stopping a remote runner; does not claim that an unreachable process has stopped. |
| `events.publish` | Approved execution | `{event:string,payload:JSON}` | Publish a bounded plugin-identified UI event; the host supplies identity and runtime generation. |
| `secrets.get` | `secrets` | `{key:string}` | Read this plugin's own OS-keyring secret; return string or null. Never exposes SSH credentials. |
| `secrets.set` | `secrets` | `{key:string,value:string}` | Store this plugin's own secret in the operating system keyring, at most 16KiB. |
| `secrets.delete` | `secrets` | `{key:string}` | Delete this plugin's own keyring secret. |
| `tasks.start` | Approved execution | `{executable:string,args?:string[],cwd?:string,sessionId?:string,platform?:posix\|windows,timeoutMs?:number}` | Start an explicitly selected executable; requires process.exec locally or ssh.exec remotely. Return taskId. Separate bounded stdout/stderr; default 30 minutes, maximum 24 hours. |
| `tasks.list` | Approved execution | `{}` | List this runtime's own background processes. |
| `tasks.status` | Approved execution | `{taskId:string}` | Read this runtime's own process status and exit code. |
| `tasks.readOutput` | Approved execution | `{taskId:string,afterSeq?:number}` | Read bounded sequenced stdout/stderr events; truncated reports expired output. |
| `tasks.write` | Approved execution | `{taskId:string,data:string}` | Write UTF-8 to this runtime's own process stdin; at most 128KiB. |
| `tasks.closeInput` | Approved execution | `{taskId:string}` | Close this runtime's own process stdin. |
| `tasks.cancel` | Approved execution | `{taskId:string}` | Stop this runtime's own process; local process trees are terminated, remote server signal support may vary. |
| `tools.invoke` | Approved execution | `{method:string,params:object,mode:ask\|approve\|full\|readOnly,scope:{sessionIds?:string[],hostIds?:string[],localRoots?:string[],remoteRoots?:{sessionId:string,path:string}[]},review?:{approved:boolean,reason:string},clientId?:string,requestId?:string}` | Execute an allowlisted AI/MCP tool after permission, target scope and approval checks. ReadOnly rejects every command and mutation. Review may only be supplied by a trusted plugin's independent reviewer. |
| `tools.cancel` | Approved execution | `{requestId:string}` | Cancel this plugin runtime's pending tool invocation; already completed operations cannot be rolled back. |
| `tools.revokeClient` | Approved execution | `{clientId:string}` | Cancel pending tool invocations owned by this plugin runtime's client. |
| `api.describe` | Approved execution | `{}` | List the fixed versioned host API; every request still checks runtime authorization. |
| `log` | `log` | `{message:string,level?:string}` | Write a bounded plugin-tagged log message. |
| `app.info` | `app.read` | `{}` | Read application metadata, platform and preference schema; no credentials. |
| `app.openExternal` | `app.openExternal` | `{url:string}` | Open an http/https URL with the system browser. |
| `settings.get` | `settings.read` | `{}` | Read application preferences. |
| `settings.update` | `settings.write` | `{patch:object}` | Update and sanitize preferences through the normal settings service. |
| `hosts.snapshot` | `hosts.read` | `{}` | Read saved host and group metadata; authentication secrets are never returned. |
| `hosts.create` | `hosts.write` | `{input:HostInput}` | Create a validated saved host. |
| `hosts.update` | `hosts.write` | `{id:string,input:HostInput}` | Replace a saved host's validated metadata. |
| `hosts.delete` | `hosts.write` | `{id:string}` | Delete a saved host and forget its stored credential. |
| `hosts.markUsed` | `hosts.write` | `{id:string}` | Update a saved host's last-used time. |
| `hosts.reorder` | `hosts.write` | `{ids:string[]}` | Persist the order of saved hosts; at most 500 IDs. |
| `groups.create` | `hosts.write` | `{input:GroupInput}` | Create a validated host group. |
| `groups.update` | `hosts.write` | `{id:string,input:GroupInput}` | Update a validated host group. |
| `groups.delete` | `hosts.write` | `{id:string}` | Delete a host group through the normal group service. |
| `sessions.list` | `sessions.read` | `{}` | List active SSH session metadata; no passwords or private keys. |
| `sessions.connect` | `ssh.exec` | `{request:SshConnectRequest}` | Connect a saved host with normal host-key verification; never auto-trust a server. |
| `sessions.disconnect` | `ssh.exec` | `{sessionId:string}` | Disconnect an active SSH session. |
| `sessions.exec` | `ssh.exec` | `{sessionId:string,command:string,timeoutMs?:number}` | Execute in a separate SSH channel; return stdout/stderr/exitCode/signal. Timeout 100–60000ms, output at most 1MiB. |
| `terminal.write` | `ssh.exec` | `{sessionId:string,data:string}` | Write plain UTF-8 terminal input, including remote shell commands; the host handles transport encoding. |
| `terminal.resize` | `ssh.exec` | `{sessionId:string,cols:number,rows:number}` | Resize the remote terminal through the validated session service. |
| `files.local.home` | `fs.read` | `{}` | Read the local home directory path. |
| `files.local.list` | `fs.read` | `{path?:string}` | List a local directory. |
| `files.local.readText` | `fs.read` | `{path:string}` | Read a UTF-8 local text file, at most 512KiB; reject binary data. |
| `files.local.writeText` | `fs.write` | `{path:string,content:string}` | Replace an existing local UTF-8 file, at most 512KiB. |
| `files.local.createFile` | `fs.write` | `{path:string}` | Create an empty local file without replacing an existing file. |
| `files.local.mkdir` | `fs.write` | `{path:string}` | Create a local directory. |
| `files.local.rename` | `fs.write` | `{from:string,to:string,overwrite?:boolean}` | Rename a local file or directory; overwriting is opt-in. |
| `files.local.copy` | `fs.read`, `fs.write` | `{from:string,to:string,overwrite?:boolean}` | Copy local files/directories through the existing copy service. |
| `files.local.delete` | `fs.write` | `{path:string,isDir:boolean}` | Delete a local file or directory. |
| `files.sftp.list` | `sftp.read` | `{sessionId:string,path?:string}` | List a remote directory using an active SSH session. |
| `files.sftp.resolveDirectory` | `sftp.read` | `{sessionId:string,path?:string}` | Resolve the SSH account home and an optional working directory through SFTP without listing entries or executing a shell. Return {home,path}. Supports ~ and relative paths. |
| `files.sftp.readText` | `sftp.read` | `{sessionId:string,path:string}` | Read remote UTF-8 text through the editor service; API response size limits apply. |
| `files.sftp.writeText` | `sftp.write` | `{sessionId:string,path:string,content:string}` | Replace existing remote text through the editor service. |
| `files.sftp.createFile` | `sftp.write` | `{sessionId:string,path:string}` | Create an empty remote file without replacing an existing file. |
| `files.sftp.mkdir` | `sftp.write` | `{sessionId:string,path:string}` | Create a remote directory. |
| `files.sftp.rename` | `sftp.write` | `{sessionId:string,from:string,to:string,overwrite?:boolean}` | Rename a remote file/directory; overwriting is opt-in. |
| `files.sftp.copy` | `sftp.read`, `sftp.write` | `{sessionId:string,from:string,to:string,overwrite?:boolean}` | Copy remote files/directories within a session. |
| `files.sftp.delete` | `sftp.write` | `{sessionId:string,path:string,isDir:boolean}` | Delete a remote file or directory. |
| `files.upload` | `fs.read`, `sftp.write` | `{sessionId:string,localPath:string,remotePath:string,overwrite?:boolean}` | Copy a local file or directory to a remote path. Return transferId; cancellation, progress and file refresh use the normal transfer service. Revoking access or stopping this runtime cancels its active transfers. |
| `files.download` | `sftp.read`, `fs.write` | `{sessionId:string,remotePath:string,localPath:string,overwrite?:boolean}` | Copy a remote file or directory to a local path. Return transferId; never remove the source. Revoking access or stopping this runtime cancels its active transfers. |
| `files.cancelTransfer` | Approved execution | `{transferId:string}` | Cancel only a transfer owned by this plugin's current runtime. Return true if its active transfer was found; false for completed, missing or other owners' transfers. |
| `files.transferStatus` | Approved execution | `{transferId:string}` | Read progress or the final TransferEvent for this runtime's own transfer; return null for missing, other-owner or expired IDs. The latest 256 completed plugin transfers are retained in memory. |
| `monitor.system` | `monitor.read` | `{}` | Read local CPU, memory, disk and network statistics. |
| `monitor.stats` | `monitor.read` | `{sessionId:string}` | Sample remote system statistics. |
| `monitor.processes` | `monitor.read` | `{sessionId:string}` | List remote processes. |
| `monitor.kill` | `monitor.write` | `{sessionId:string,pid:number}` | Send TERM to a remote process; protected process validation still applies. |
| `history.list` | `history.read` | `{hostId:string,limit?:number}` | Read saved command history, at most 500 rows. |
| `history.record` | `history.write` | `{hostId:string,command:string}` | Record a command for an existing saved host. |
| `history.delete` | `history.write` | `{id:number}` | Delete one command-history entry. |
| `history.clear` | `history.write` | `{hostId:string}` | Clear a saved host's command history. |
| `workspace.snapshot` | `workspace.read` | `{}` | Read the live tabs, panes, active group and split layout. |
| `workspace.openPage` | `workspace.write` | `{kind:welcome\|settings\|about\|updates\|knownHosts}` | Open or focus an existing application page. |
| `workspace.openHost` | `workspace.write`, `hosts.read` | `{hostId:string}` | Open a saved host's details; never reveal an authentication secret. |
| `workspace.openTerminal` | `workspace.write`, `sessions.read` | `{sessionId:string}` | Open a terminal tab for an already-connected session. |
| `workspace.openFiles` | `workspace.write`, `sessions.read` | `{sessionId:string}` | Open a file browser for an already-connected session. |
| `workspace.openSidebar` | `workspace.write` | `{view:hosts\|plugins\|knownHosts}` | Dock a list into the current workspace group. |
| `workspace.activate` | `workspace.write` | `{tabId:string}` | Activate an existing tab and its group. |
| `workspace.close` | `workspace.write` | `{tabId:string}` | Close a tab; dirty editors retain the normal user confirmation. Result reports pending confirmation. |
| `workspace.split` | `workspace.write` | `{tabId:string,direction:row\|column,position?:before\|after,targetPaneId?:string}` | Move a tab into a split group. |
| `workspace.move` | `workspace.write` | `{tabId:string,paneId:string,beforeTabId?:string\|null}` | Move or reorder an existing tab. |
| `workspace.showQuickAccess` | `workspace.write` | `{query?:string}` | Open Quick Access with an optional query. Never execute a command automatically. |
| `workspace.setPaneLocked` | `workspace.write` | `{paneId:string,locked:boolean}` | Set the destination lock on an existing pane. |
| `workspace.resizeSplit` | `workspace.write` | `{splitId:string,ratio:number}` | Resize an existing split with a ratio between 0.1 and 0.9. |
| `workspace.returnSidebar` | `workspace.write` | `{view:hosts\|plugins\|knownHosts}` | Return a docked list to the sidebar. |
| `clipboard.readText` | `clipboard.read` | `{}` | Read the system text clipboard. |
| `clipboard.writeText` | `clipboard.write` | `{text:string}` | Replace the system text clipboard. |
| `storage.get` | Approved execution | `{key:string}` | Read plugin-scoped JSON data. Keys use 1–128 ASCII letters, digits, dot, hyphen or underscore. |
| `storage.set` | Approved execution | `{key:string,value:JSON}` | Persist plugin-scoped JSON data, at most 256KiB total per plugin. |
| `storage.delete` | Approved execution | `{key:string}` | Remove a key from plugin-scoped JSON data. |
| `ui.showMessage` | Approved execution | `{message:string,kind?:info\|success\|error}` | Show a bounded notification prefixed with the installed plugin's identity. |
| `ui.confirm` | Approved execution | `{message:string}` | Ask the user a plugin-identified confirmation; never replace an existing dialog. |
