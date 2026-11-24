import type { HostInput } from "./contract.mjs";

export interface SshConfigIssue {
  code: "readFailed" | "tooLarge" | "invalidLine" | "unsupportedOption" | "invalidValue"
    | "missingJump" | "existingConflict" | "includeCycle";
  detail: string;
}

export interface SshConfigEntry {
  alias: string;
  input: (Omit<Required<HostInput>, "authMethod"> & { authMethod: "agent" | "key" }) | null;
  jumpAliases: string[];
  issues: SshConfigIssue[];
  existingId: string | null;
}

export interface SshConfigPreviewPage {
  found: boolean;
  revision: string;
  entries: SshConfigEntry[];
  total: number;
  nextOffset: number | null;
  issues: SshConfigIssue[];
}
