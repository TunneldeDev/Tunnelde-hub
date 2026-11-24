import type { ExtensionDirectory, MethodDescription } from "./contract.mjs";

export interface DiscoveryMethodMap {
  "extensions.describe": [Record<string, never>, ExtensionDirectory];

  "api.describe": [
    Record<string, never>,
    { version: number; methods: MethodDescription[] },
  ];
}
