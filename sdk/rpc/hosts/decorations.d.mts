/** Experimental additive host-list appearance. Does not modify saved host metadata. */
export interface HostDecoration {
  hostId: string;
  badge?: string | null;
  description?: string | null;
  tooltip?: string | null;
  icon?:
    | "server"
    | "cloud"
    | "container"
    | "database"
    | "globe"
    | "code"
    | "terminal"
    | "shield"
    | "key"
    | "activity"
    | null;
  tone?: "neutral" | "info" | "success" | "warning" | "error";
}

export interface HostDecorationCollection {
  id: string;
  priority?: number;
  decorations: HostDecoration[];
}
