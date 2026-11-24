// BEGIN GENERATED WORKSPACE V1 TYPES
/** Wire DTOs for the v1 workspace snapshot, independent of workbench stores. */
export interface PluginFileViewPreferences {
  filesColumns?: string[];
  filesColumnWidths?: Partial<Record<"name" | "type" | "size" | "modified", number>>;
  filesLayout?: string;
  filesShowHidden: boolean;
  filesFoldersFirst: boolean;
  filesSortBy: string;
  filesSortDirection: string;
  filesGroupBy?: string;
}

export interface PluginFilePane {
  source: { kind: "local" } | { kind: "remote"; sessionId: string };
  path: string | null;
  ownerSessionId: string;
  view?: PluginFileViewPreferences;
  remoteIdentity?: { hostId: string; address: string };
  offline?: boolean;
}

export interface PluginWorkspaceTab {
  id: string;
  /** Open vocabulary: plugins must tolerate tab kinds they do not recognize. */
  kind: string;
  title: string;
  hostId: string | null;
  pinned: boolean;
  preview?: boolean;
  hidden?: boolean;
  filePane?: PluginFilePane;
  fileSessionId?: string | null;
}

export interface PluginWorkspacePane {
  id: string;
  tabIds: string[];
  activeId: string | null;
  locked?: boolean;
}

export type PluginWorkspaceLayout =
  | { kind: "pane"; paneId: string }
  | {
      kind: "split";
      id: string;
      direction: "row" | "column";
      ratio: number;
      first: PluginWorkspaceLayout;
      second: PluginWorkspaceLayout;
    };

export interface PluginWorkspaceSnapshot {
  tabs: PluginWorkspaceTab[];
  panes: PluginWorkspacePane[];
  activeId: string | null;
  activePaneId: string;
  layout: PluginWorkspaceLayout;
}
// END GENERATED WORKSPACE V1 TYPES
