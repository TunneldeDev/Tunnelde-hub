// BEGIN GENERATED HOST FIELDS V1 TYPES
/** Experimental public metadata, independent of Host and internal settings. */
export interface HostField {
  id: string;
  label: string;
  type: "text" | "number" | "boolean" | "select";
  description?: string;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: { value: string; label: string }[];
}
export interface HostFieldsSchema {
  version: number;
  fields: HostField[];
}
export type HostFieldValue = string | number | boolean;
export interface HostFieldsDocument {
  hostId: string;
  revision: number;
  schemaDigest: string;
  schemaVersion: number;
  storedSchemaVersion: number | null;
  schemaChanged: boolean;
  values: Record<string, HostFieldValue>;
}
export interface HostFieldsSnapshot {
  schema: HostFieldsSchema;
  document: HostFieldsDocument;
}
export interface HostFieldsUpdate {
  hostId: string;
  expectedRevision: number;
  schemaDigest: string;
  values: Record<string, HostFieldValue>;
}
// END GENERATED HOST FIELDS V1 TYPES

/** Optional experimental Manifest metadata; editing does not start a runtime. */
export interface HostFieldsContribution {
  hostFields?: HostFieldsSchema;
}
