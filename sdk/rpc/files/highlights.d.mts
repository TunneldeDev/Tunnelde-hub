type Match =
  | { name: string; extension?: never; pathPrefix?: never }
  | { extension: string; name?: never; pathPrefix?: never }
  | { pathPrefix: string; extension?: never; name?: never };

export interface FileHighlightCollection {
  id: string;
  priority?: number;
  source?: string;
  directory?: string;
  highlights: {
    match: Match;
    tooltip?: string;
    tone?: "neutral" | "info" | "success" | "warning" | "error";
  }[];
}
