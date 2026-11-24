import type { ConfigurationSchema } from "./data/schema.mjs";
import type { ConfigurationSnapshot, ConfigurationExpected, ConfigurationUpdate, ConfigurationBackup, ConfigurationBackupRequest } from "./data/document.mjs";

export interface ConfigurationClient {
  schema(): Promise<ConfigurationSchema>;
  snapshot(): Promise<ConfigurationSnapshot>;
  update(request: ConfigurationUpdate): Promise<ConfigurationSnapshot>;
  migrate(expected: ConfigurationExpected): Promise<ConfigurationSnapshot>;
  backups(): Promise<ConfigurationBackup[]>;
  restore(request: ConfigurationBackupRequest): Promise<ConfigurationSnapshot>;
  deleteBackup(request: ConfigurationBackupRequest): Promise<null>;
}
