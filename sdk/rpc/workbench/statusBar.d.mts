/** Stable status bar contract v1 (host >= 0.31.1). IDs belong to one runtime. */
export interface StatusBarItem {
  id: string;
  text: string;
  alignment?: "left" | "right";
  priority?: number;
  tooltip?: string | null;
  icon?:
    | "activity"
    | "check"
    | "alert"
    | "info"
    | "sync"
    | "terminal"
    | "cloud"
    | "code"
    | "plug"
    | null;
  /** This plugin's manifest command; editor/file-menu commands require context and are excluded. */
  command?: string | null;
}
