export interface PluginView {
  id: string;
  title: string;
  location?: "sidebar" | "workspace";
  kind?: "blocks" | "chat" | "component";
  /** Component provider chosen explicitly in settings; omit location. */
  provider?: "hostList" | "workbench" | "fileBrowser" | "filePreview" | "terminal" | "history" | "forwarding" | "monitor" | "backgroundTasks" | "processes" | "quickAccess" | "preferences";
  icon?: string;
}
