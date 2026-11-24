import type { RuntimeResource } from "./resource.mjs";
export interface RuntimeResourcesQuery {
  offset?: number;
  /** Required after the first page; restart from zero on a changed observation. */
  revision?: string;
}
export interface RuntimeResourcesSnapshot {
  revision: string;
  items: RuntimeResource[];
  total: number;
  nextOffset: number | null;
}
