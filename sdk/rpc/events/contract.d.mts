/** The host supplies plugin identity and generation; plugins cannot impersonate another runtime. */
export interface PluginEvent<T = unknown> {
  pluginId: string;
  generation: number;
  event: string;
  payload: T;
}
