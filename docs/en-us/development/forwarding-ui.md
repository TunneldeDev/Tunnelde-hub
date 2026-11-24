# Forwarding UI provider

[简体中文](../../zh-cn/development/forwarding-ui.md)

Declare a component view with `provider: "forwarding"` and the permissions
`ui.trusted`, `hosts.read`, and `forwards.read`. The user selects it in Settings.
`props.forwarding` is scoped to the saved host selected by the native panel.
Dynamic host sources must first be saved as an ordinary host. This experimental
SDK declarations live in `sdk/ui/forwarding/entry.d.mts` and `provider.d.mts`.
In the application, private adapters live in `extensions/forwarding/`, and native
presentation, state, actions and contracts remain in their forwarding directories.

Read `snapshot`, then page with `read({ revision: snapshot.revision, offset })`.
Pages contain at most 128 immutable rows and 65536 UTF-16 text units. A retained
page stays readable; actions require the current host and revision. No SSH session
IDs or mutable application stores are exposed. `runtimeId` identifies an active
instance so an old Stop action cannot stop its replacement.

`Entries` optionally mounts the original native rows once. Omitting it does not
unmount the host controller or editor. Host selection, add/refresh controls,
credential/host-key dialogs, exposure warnings, editor, confirmations and recovery
remain host-owned. During editing the presentation stays mounted but hidden and
receives `visible: false`. Use `capabilities.write` to decide whether to offer
mutations; `forwards.write` is checked again at action, delayed confirmation,
authentication completion and final native admission. Completion and errors are
reported in subsequent snapshots; actions do not promise a remote transaction.

`start`, `startAll`, `stop`, `requestAdd`, `requestEdit`, `requestRemove`, and
`requestDisconnect` act on existing rows or open native controls. Plugins cannot
inject arbitrary endpoints through these UI actions. Connections are independent
background SSH acquisitions; unpublished connections are hidden from other panels
and cleaned if their scope closes. Accepted connections and listeners survive a
presentation switch but belong to the plugin runtime and close on its revocation.
Saved rules remain persisted. Changing away and back does not revive old scopes.
Prepared listeners cannot relay data before authorized commit.

Existing stable RPC methods are unchanged. The new experimental provider target
widens discovery and manifest target unions: old code that exhaustively enumerates
targets must handle unknown targets. Frozen historical fixtures remain unchanged;
checks allow only the documented additive exports and target-union widening.
Trusted frontend modules share the host context and native bridge; these checks
are not a sandbox for hostile JavaScript.
