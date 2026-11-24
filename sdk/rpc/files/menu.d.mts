export interface FileMenuContribution {
  sources: ("local" | "remote")[];
  kinds: ("file" | "directory")[];
  /** Case-insensitive file suffixes without the leading dot; directories ignore this filter. */
  extensions?: string[];
}

export interface FileMenuCommandInput {
  file: {
    path: string;
    name: string;
    isDirectory: boolean;
    source: { kind: "local" } | { kind: "remote"; sessionId: string };
  };
}
