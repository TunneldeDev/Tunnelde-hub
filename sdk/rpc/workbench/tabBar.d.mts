/** Stable v1 tab-bar controls, available since 0.32.0-beta.6. Set replaces the whole item. */
export interface TabBarItem {
  id: string;
  title: string;
  kind: "button" | "select" | "text";
  /** Default trailing. Leading controls appear before the tabs. */
  placement?: "leading" | "trailing";
  /** Plugin-scoped group ID; adjacent groups have subtle separators. */
  group?: string | null;
  /** Plain-text hover description, at most 512 characters. */
  tooltip?: string | null;
  /** Keep button text next to its icon. */
  showLabel?: boolean;
  /** Button-only toggle state. Update with set() after a successful command. */
  checked?: boolean | null;
  priority?: number;
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
    | "copy"
    | "clear"
    | "folder"
    | "file"
    | "wrap"
    | "follow"
    | "play"
    | "pause"
    | "filter"
    | null;
  command?: string | null;
  disabled?: boolean;
  /** Omit to target own plugin views; {} targets all tabs. IDs are opaque. */
  when?: { tabKind?: string | null; tabId?: string | null } | null;
  options?: Array<{ value: string; label: string }>;
  value?: string | null;
}

/** Advisory command input; does not grant editor, file or SSH permissions. */
export interface TabBarCommandContext {
  itemId: string;
  tabId: string;
  tabKind: string;
  paneId: string;
  value: string | null;
}

/** Input passed to the manifest command; context never grants resource permissions. */
export interface TabBarCommandInput {
  _locale: string | null;
  _tabBar: TabBarCommandContext;
}
