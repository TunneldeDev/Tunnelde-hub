/** Experimental main-window presentation metadata; separate from frozen workspace v1. */
export type PanelPresentation = "sidebar" | "workspace" | "floating";

export interface PanelMetadata {
  id: string;
  windowId: "main";
  presentation: PanelPresentation;
  visible: boolean;
  pinned: boolean;
  /** Same-document floating geometry, not native OS window coordinates. */
  bounds: { x: number; y: number; width: number; height: number } | null;
  available: boolean;
  presentations: PanelPresentation[];
}

export interface PanelsSnapshot {
  /** Opaque process-local token. Not a durable replay cursor or authorization. */
  revision: string;
  windowId: "main";
  panels: PanelMetadata[];
}

export interface PanelPresentationsDiscovery {
  version: 1;
  experimental: true;
  presentations: PanelPresentation[];
  methods: (
    | "workspace.panels.list"
    | "workspace.panels.observe"
    | "workspace.panels.setPresentation"
    | "workspace.panels.close"
  )[];
  readPermission: "workspace.read";
  writePermission: "workspace.write";
  events: "workspace://panels-changed"[];
  ownership: string;
}
