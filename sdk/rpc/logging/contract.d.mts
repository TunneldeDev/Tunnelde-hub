export type PluginLogValue =
  | string
  | number
  | boolean
  | null
  | PluginLogValue[]
  | { [key: string]: PluginLogValue };

/** Stable v1 when discovery includes the log contract; structured options and
 * requested-severity handling require 0.33.0-beta.5+. Message/level exist since
 * 0.21.0. Success means accepted, not durable delivery. Never log secrets in prose.
 */
export interface PluginLogOptions {
  level?: string;
  domain?: string | null;
  operation?: string | null;
  requestId?: string | null;
  fields?: Record<string, PluginLogValue>;
}
