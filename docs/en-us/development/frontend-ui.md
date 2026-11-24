# Trusted frontend plugins

[简体中文](../../zh-cn/development/frontend-ui.md) · [Extension architecture](plugin-api.md)

The experimental UI SDK is versioned separately from RPC `apiVersion: 1`.
`extensions.describe().frontend` reports its version, trust model, components and
limits. The marketplace SDK publishes `tunnelde-ui.d.mts`; it is generated from
the host's public contract, not its stores or component source paths.

Frontend commands can contribute [host menu actions](host-menu.md).

## Domain type imports

`sdk/tunnelde-ui.d.mts` remains the compatibility entry point. Its declarations are
organized under `sdk/ui/<domain>/`: runtime resources, components, search, frontend
lifecycle, workbench, files, terminal and history. Import all types from the old
entry or choose a domain, for example:

```ts
import type { FrontendContext } from "./sdk/tunnelde-ui.mjs";
import type { FrontendTerminal } from "./sdk/ui/terminal/surface.mjs";
```

These imports are erased by TypeScript; runtime SDK access still comes from the
activation context. Copy the entire SDK declaration tree when developing a plugin.
`sdk:sync` follows the host's public dependency graph, and `sdk:check` verifies all
files and `ui-contracts.json`. Private types, runtime imports, cycles, unreachable
contracts and abandoned generated files fail validation. Historical declarations
remain a compatibility fixture. Organization does not change UI SDK 0.1.0's
experimental status or the existing RPC protocol.

The RPC catalogue reader is organized separately under `scripts/sdk/catalogue/`.
It accepts the historical single-file catalogue and the domain composition form,
checks all referenced method files and applies stable schemas only after complete
assembly. Unknown entries, duplicate methods and unreferenced domains fail closed.

For repository development, run `npm ci --ignore-scripts` before `npm test`.
The pinned TypeScript and React/Node declarations are test tools only; plugins
do not acquire an implicit Node runtime or a second React instance.

## Manifest and module

A pure frontend plugin needs no Node runtime. Existing Node, WASM and declarative
plugins can add the same `frontend` declaration without changing their backend.
For combined runtimes, mark only frontend-handled commands with `frontend: true`.

```json
{
  "id": "custom-view",
  "name": "Custom view",
  "version": "1.0.0",
  "apiVersion": 1,
  "runtime": "frontend",
  "frontend": { "entry": "ui/index.mjs", "sdk": "^0.1.0" },
  "permissions": ["ui.trusted"],
  "commands": [{ "id": "hello", "title": "Hello" }],
  "views": [{ "id": "main", "title": "Custom view", "kind": "component" }]
}
```

`ui/index.mjs` exports `activate(context)`. Register only manifest-declared view
and command IDs. The host publishes views after activation succeeds. Registration
returns an idempotent release function; activation can return an optional cleanup.

```js
export function activate(context) {
  const React = context.sdk.react;
  const { Button } = context.sdk.components;
  function Counter() {
    const [count, setCount] = React.useState(0);
    return React.createElement(
      Button,
      {
        onClick: () => setCount((value) => value + 1),
      },
      `Count ${count}`,
    );
  }
  context.views.register("main", Counter);
  context.commands.register("hello", () => ({ text: "Hello" }));
}
```

Use the supplied React instance. Do not bundle React, React DOM or a JSX runtime
into the plugin. For JSX builds, use classic `React.createElement` transformation
and bind `React` from `context.sdk.react`. Relative ESM imports can load other
approved `ui/` assets. Entry paths use ASCII letters, numbers, `.`, `_`, `-` and
`/`, start with `ui/`, end with `.mjs`, and cannot contain empty or dot segments.

Host components include Button, IconButton, Field, Input, Textarea, Switch,
SearchField and EmptyState. They inherit the host theme. SearchField presets use
the same mandatory `@field:value` syntax as the application. Component props,
resource scopes and frontend context are described by the public SDK types.
Custom CSS must scope its selectors; this version does not isolate DOM or CSS.

## Trust and lifetime

Approval explicitly warns that frontend code runs in the host JavaScript context.
It can access the DOM and native bridge beyond the SDK wrapper. It is trusted
code, not a sandbox. Stopping removes host-owned registrations and revokes module
URLs and SDK calls; it cannot undo arbitrary DOM mutations, forcibly stop a loop
or remove already evaluated JavaScript. Restart in `--safe-mode` or
`--restricted-mode` when recovery requires preventing plugin execution.

The host hashes and captures the same package bytes. Approval is bound to that
digest and runtime generation; changing installed files requires new approval.
Local protocol URLs are revoked on stop, permission change and WebView teardown.
Module assets are bounded to 8 MiB per package and 32 MiB across at most 16 owners;
snapshot work and protocol requests have separate concurrency limits. Assets use
an explicit MIME allowlist and no HTML document transport. Production CSP permits
the local module protocol, not arbitrary network scripts or blob scripts.

`context.resources` owns registered cleanup and asynchronous work. Module opening,
import and activation each have a 15-second deadline; SDK calls and commands have
a 60-second deadline. Cancellation rejects callers promptly and cleans late
resources, but does not roll back native or remote side effects. Observe
`context.signal` and release timers, event listeners and other resources.

`context.api.call` uses the existing approved RPC dispatcher, permissions, input
and output bounds, and authorization checks after asynchronous work. Frontend
commands retain normal command discovery and shortcut routing. Activation and
render errors reach software logs; a failed activation stops the plugin, and
component views expose Refresh for recovery.

The SDK also supports explicit [interface providers](ui-providers.md)
for the host list and workbench presentation. The remaining domain services and
dependency management are still under development.

A runnable plain-ESM example is in [examples/trusted-ui](../../../examples/trusted-ui/README.en-us.md).

[Terminal screen composition and bounded subscriptions](terminal-ui.md).

## Composing UI resource lifetimes

Check `extensions.describe().frontend.resourceScopes` or `context.resources.child`
for the experimental child-scope capability. The optional member keeps older
structural SDK implementations compatible. Create each panel or subscription scope
inside a committed React effect, then dispose it in the effect cleanup:

```js
React.useEffect(() => {
  const scope = context.resources.child?.({ limit: 8 });
  if (!scope) return; // An older host needs the plugin's explicit fallback.
  const timer = setInterval(() => {
    /* refresh this view */
  }, 1000);
  scope.use(() => clearInterval(timer));
  return () => scope.dispose();
}, []);
```

A child inherits module cancellation; disposing it closes its descendants without
closing siblings. Moving or hiding a retained panel is different from unmounting:
keep its scope until its effect actually closes. React development-mode effect
replay creates a fresh scope; never reuse an aborted scope.

Each open child consumes one parent reservation. Work and asynchronous cleanup in
its descendants count against every ancestor, including after the child closes.
`size` includes this entire subtree. Cancellation and deadlines reject promptly,
but uncooperative work keeps its reservation until its result or failure settles;
a late acquired resource is cleaned instead of delivered. Async cleanup retains
the reservation until completion, including cleanup for an already supplied
resource rejected over quota. Cleanup failures reach the module's software log.
The module default is 128 reservations. Internal configured scopes allow at most
4096; a child may only lower its local cap, never exceed its parent's cap. Maximum
child depth is 32. A closed scope admits no new work.

These are JavaScript lifetimes, separate from `resources.snapshot/release` native
ownership and durable runner recovery. They grant no permissions, do not forcibly
interrupt trusted code, and do not undo remote operations. Closing a UI scope
alone does not stop a durable task or erase its recovery record. Use the explicit
native lifecycle and recovery APIs for those operations. Asynchronous cleanup is
observed, not a sequential transaction or a promise that process exit completed.

## Host-owned view resources

Hosts advertising `frontend.viewLifetimes` pass optional `resources` in
`FrontendViewProps`. Each committed ordinary view or selected provider instance
receives a separate module descendant. Older hosts omit this property; check the
capability and provide an explicit fallback when supporting them.

```js
function View({ resources }) {
  React.useEffect(() => {
    if (!resources) return;
    const timer = setInterval(refresh, 1000);
    return resources.use(() => clearInterval(timer));
  }, [resources]);
  return React.createElement("div", null, "View content");
}
```

Register resources in effects or event handlers, never during render. Return the
individual release callback from an effect so that effect replay or dependency
changes also clean it. The host additionally disposes forgotten registrations when
the view actually unmounts, its renderer fails or its runtime retires. Host-effect
replay uses a fresh scope; a closed scope never becomes active again.

Hiding or moving retained content preserves the same scope. Closing and reopening
creates another scope; same-ID sibling instances remain independent. A provider
selection change, including a batched A → B → A change, retires the old scope.
Changing the bound terminal, file source/session, history session, forwarding host,
monitor session or process session also changes that provider's lifetime. Ordinary
directory refreshes and changing `visible` do not. Only actual retained mounts
preserve lifetime: a layout operation that unmounts React content closes it.

The host allocates only after commit, checks the exact module token, fingerprint
and registered renderer, and shares the module's resource budget. Quota exhaustion
reports through the existing error/recovery UI without restarting siblings. Native
Workspace/Screen validation starts after the provider has actually mounted; their
portal owners retain editor state, terminal buffers and SSH connections during
selection and recovery.

`context.resources` remains module-owned. `props.resources` does not implicitly
adopt native handles, cancel RPC transport or stop durable/background tasks.
Wrap asynchronous view work with `run` or `acquire` to reject late delivery and
clean late results; underlying uncooperative work remains charged until settlement.
Use the explicit native ownership/recovery APIs when retiring those resources.
