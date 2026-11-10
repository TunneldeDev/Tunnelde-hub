import type { ConfigurationSchema } from "./data/schema.mjs";
import type { ConfigurationSnapshot, ConfigurationExpected, ConfigurationUpdate, ConfigurationBackup, ConfigurationBackupRequest } from "./data/document.mjs";

export interface ConfigurationMethodMap {
  "configuration.schema": [Record<string, never>, ConfigurationSchema];
  "configuration.snapshot": [Record<string, never>, ConfigurationSnapshot];
  "configuration.update": [ConfigurationUpdate, ConfigurationSnapshot];
  "configuration.migrate": [ConfigurationExpected, ConfigurationSnapshot];
  "configuration.backups": [Record<string, never>, ConfigurationBackup[]];
  "configuration.restore": [ConfigurationBackupRequest, ConfigurationSnapshot];
  "configuration.deleteBackup": [ConfigurationBackupRequest, null];
}
