export interface SettingsMethodMap {
  "settings.get": [Record<string, never>, Record<string, unknown>];
  "settings.update": [
    { patch: Record<string, unknown> },
    Record<string, unknown>,
  ];
}
