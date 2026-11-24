/** Public experimental UI SDK 0.1.0 contract. */
import type * as React from "react";
import type { UiSdk } from "../components/sdk.mjs";
import type { UiResourceScope, UiResourceOptions } from "../runtime/resources.mjs";
import type { FrontendBackgroundTaskRunner } from "../backgroundTasks/execution.mjs";
import type { FrontendViewProps } from "./views.mjs";

export interface FrontendContext {
  readonly sdk: UiSdk;
  readonly pluginId: string;
  readonly signal: AbortSignal;
  readonly resources: UiResourceScope;
  /** Available on hosts with frontend.backgroundTasks execution discovery. */
  readonly backgroundTasks?: FrontendBackgroundTaskRunner;
  /** Calls retain existing RPC authorization, size limits and stable contracts. */
  readonly api: {
    call<T = unknown>(
      method: string,
      params?: Record<string, unknown>,
      options?: UiResourceOptions,
    ): Promise<T>;
  };
  readonly views: {
    register(id: string, component: React.ComponentType<FrontendViewProps>): () => void;
  };
  readonly commands: {
    register(
      id: string,
      handler: (input: Record<string, unknown>, signal: AbortSignal) => unknown | Promise<unknown>,
    ): () => void;
  };
}
export interface FrontendModule {
  activate(
    context: FrontendContext,
  ): void | (() => void | Promise<void>) | Promise<void | (() => void | Promise<void>)>;
}
