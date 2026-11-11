import { readFileSync } from "node:fs";

// These capabilities are consumed by trusted UI or dedicated runtime IPC rather
// than an ordinary RPC method. SDK synchronization checks the complete native set.
export const capabilityPermissions = Object.freeze([
  "ui.trusted", "backgroundTasks.read", "backgroundTasks.write", "network", "process.exec",
]);
const catalogue = JSON.parse(readFileSync(new URL("../../sdk/api.json", import.meta.url), "utf8"));
export const permissionsFor = catalogue => new Set([...capabilityPermissions, ...catalogue.methods.flatMap(method => method.permissions)]);
export const knownPermissions = permissionsFor(catalogue);
