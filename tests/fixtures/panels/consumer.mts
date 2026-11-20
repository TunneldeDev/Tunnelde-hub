import type { Host, HostMethodMap, PanelMetadata, PanelsSnapshot, PluginWorkspaceSnapshot } from "../../../sdk/tunnelde-plugin.mjs";
declare const host: Host;
const discovery = (await host.extensions.describe()).panelPresentations;
if (discovery?.version === 1) {
  const permission: "workspace.read" = discovery.readPermission;
  void permission;
  const owner = new AbortController();
  const current: PanelsSnapshot = await host.call("workspace.panels.list", {});
  const next: PanelsSnapshot = await host.call("workspace.panels.observe", { revision: current.revision }, { signal: owner.signal, timeoutMs: 15_000 });
  for (const panel of next.panels) {
    const windowId: "main" = panel.windowId;
    void windowId;
    if (panel.available && panel.presentations.includes("floating")) {
      const updated: PanelMetadata = await host.call("workspace.panels.setPresentation", { panelId: panel.id, presentation: "floating" });
      const width: number | undefined = updated.bounds?.width;
      void width;
      const workspace: PluginWorkspaceSnapshot = await host.call("workspace.panels.close", { panelId: panel.id });
      void workspace;
    }
  }
  const resized: PluginWorkspaceSnapshot = await host.call("workspace.resizeSplits", { ratios: { split: 0.5 } });
  void resized;
  owner.abort();
}
// Check exact method-map inputs, not Host.call's intentional discovery fallback overload.
type Present = HostMethodMap["workspace.panels.setPresentation"][0];
// @ts-expect-error A same-document floating panel is not a native window.
const native: Present = { panelId: "tasks", presentation: "native" };
// @ts-expect-error Only metadata is exposed, not private feature state.
const draft: string = ({} as PanelMetadata).draft;
// @ts-expect-error Revisions are opaque strings, not sequence numbers.
const numeric: HostMethodMap["workspace.panels.observe"][0] = { revision: 1 };
// @ts-expect-error A batch contains numeric ratios only.
const invalid: HostMethodMap["workspace.resizeSplits"][0] = { ratios: { split: "0.5" } };
// @ts-expect-error Frozen workspace.snapshot v1 has no panel extension.
const panels = ({} as PluginWorkspaceSnapshot).panels;
void [native, draft, numeric, invalid, panels];
