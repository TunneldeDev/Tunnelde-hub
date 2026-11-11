# Preference form providers

[简体中文](../../zh-cn/development/preferences-ui.md) · [Interface providers](ui-providers.md)

For observation outside a page, see [Public preference observation](preferences-observation.md).

A trusted component view may declare `provider: "preferences"`. It requires
`ui.trusted` and `settings.read`; `settings.write` is optional. Users explicitly
select the provider under interface providers. Installation never selects it.

The view receives `preferences` with immutable page metadata (`section`, `query`,
`modifiedOnly`, public field IDs/labels, save state and a page revision), optional
`Fields`, and authorized `schema()`, `read()` and `update(request)` methods.
The page revision identifies presentation; only the persistent revision returned
by `read()` can be used for updates. Calls use the existing selected plugin RPC
session, permissions and quotas. Read in an effect after mount, not during render
or a layout effect before the host commits the page. Refresh retained references
when props change. Navigation or settings changes invalidate old frames; hidden
pages cannot write. A successful update may change its own page frame and still
returns its committed snapshot. Writes are never automatically retried.

Render `Fields` at most once to compose the native controls. The host moves the
same DOM and retains field drafts through selection, restore, stop, revocation
and render failure. Omitting the slot is allowed. Search, presets, navigation,
profiles, reset actions, save state, provider selection, credential/network forms,
shortcut conflict resolution, storage migration, logs and update installation
remain host-owned. The recovery bar restores native controls. Trusted code still
shares the host context; it is not a sandbox.

Public DTOs live in `contracts/preferences/data/`; the presentation contract is
`contracts/preferences/provider.ts`. Runtime authorization adapters live in
`extensions/preferences/`, separate from native form components and the private
host-field mapping. Marketplace UI and RPC DTOs are generated from the same
public source. Custom plugin preference schemas and migration are not provided
by this presentation contract.
