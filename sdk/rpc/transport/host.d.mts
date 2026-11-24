import type { ExtensionDirectory } from "../discovery/contract.mjs";
import type { HostDecorationCollection } from "../hosts/decorations.mjs";
import type { HostSource, HostSourcesPage } from "../hosts/sources.mjs";
import type { PluginLogOptions } from "../logging/contract.mjs";
import type { StatusBarItem } from "../workbench/statusBar.mjs";
import type { TabBarItem } from "../workbench/tabBar.mjs";
import type { HostMethodMap } from "./methodMap.mjs";

export interface Host {
  /** Experimental runtime-owned discovery. Never supplies credentials. */
  readonly sources: {
    set(source: HostSource): Promise<null>;
    remove(id: string): Promise<boolean>;
    snapshot(page?: { offset?: number; revision?: number }): Promise<HostSourcesPage>;
  };
  /** Stable v1; use describe() to detect support and contracts on older hosts. */
  readonly hostList: {
    setDecorations(collection: HostDecorationCollection): Promise<null>;
    removeDecorations(id: string): Promise<boolean>;
  };
  readonly extensions: { describe(): Promise<ExtensionDirectory> };
  readonly tabBar: {
    set(item: TabBarItem): Promise<null>;
    remove(id: string): Promise<boolean>;
  };
  readonly statusBar: {
    set(item: StatusBarItem): Promise<null>;
    remove(id: string): Promise<boolean>;
  };
  call<M extends keyof HostMethodMap>(
    method: M,
    params?: HostMethodMap[M][0],
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<HostMethodMap[M][1]>;
  /** Additional methods and exact parameters are discoverable through describe(). */
  call<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T>;
  describe(): Promise<HostMethodMap["api.describe"][1]>;
  log(message: string, level?: string): Promise<null>;
  log(message: string, options: PluginLogOptions): Promise<null>;
}
