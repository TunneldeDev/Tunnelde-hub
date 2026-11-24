// BEGIN GENERATED HOST COLUMNS V1 TYPES
/** Experimental runtime-owned host table presentation. No executable cell content. */
export interface HostColumn {
  id: string;
  label: string;
  type: "text" | "number" | "boolean";
  width?: number;
  cells: { hostId: string; value: string | number | boolean; tooltip?: string }[];
}
export interface HostColumnContribution extends HostColumn {
  pluginId: string;
  pluginName: string;
}
export interface HostColumnsSnapshot {
  revision: number;
  items: HostColumnContribution[];
}
// END GENERATED HOST COLUMNS V1 TYPES
