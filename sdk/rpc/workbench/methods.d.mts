import type { PluginWorkspaceSnapshot } from "./layout.mjs";
import type { StatusBarItem } from "./statusBar.mjs";
import type { TabBarItem } from "./tabBar.mjs";

export interface WorkbenchMethodMap {
  "tabBar.set": [TabBarItem, null];
  "tabBar.remove": [{ id: string }, boolean];
  "statusBar.set": [StatusBarItem, null];
  "statusBar.remove": [{ id: string }, boolean];
  "workspace.showQuickAccess": [{ query?: string }, unknown];
  "workspace.setPaneLocked": [{ paneId: string; locked: boolean }, unknown];
  "workspace.resizeSplit": [{ splitId: string; ratio: number }, unknown];
  "workspace.snapshot": [Record<string, never>, PluginWorkspaceSnapshot];
  "workspace.openPage": [
    { kind: "welcome" | "settings" | "about" | "updates" | "knownHosts" },
    unknown,
  ];
  "workspace.openHost": [{ hostId: string }, unknown];
  "workspace.openTerminal": [{ sessionId: string }, unknown];
  "workspace.openFiles": [{ sessionId: string }, unknown];
  "workspace.openSidebar": [
    { view: "hosts" | "knownHosts" | "plugins" },
    unknown,
  ];
  "workspace.activate": [{ tabId: string }, unknown];
  "workspace.close": [{ tabId: string }, unknown];
  "workspace.split": [
    {
      tabId: string;
      direction: "row" | "column";
      position?: "before" | "after";
      targetPaneId?: string;
    },
    unknown,
  ];
  "workspace.move": [
    { tabId: string; paneId: string; beforeTabId?: string | null },
    unknown,
  ];
  "workspace.returnSidebar": [
    { view: "hosts" | "knownHosts" | "plugins" },
    unknown,
  ];
  "ui.showMessage": [
    { message: string; kind?: "info" | "success" | "error" | null },
    null,
  ];
  "ui.confirm": [{ message: string }, boolean];
}
