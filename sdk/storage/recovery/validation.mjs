import { categories, bytes, invalid, revision, path, fields, list, changes } from "./values.mjs";

export function request(value, kind) {
  fields(value, kind === "observe" ? [] : ["revision", "action"], kind === "observe" ? ["revision"] : []);
  const has = Object.hasOwn(value, "revision");
  if (has && !revision(value.revision) || kind !== "observe" && !["retry", "cancel"].includes(value.action)) invalid();
  return Object.freeze({ ...(has ? { revision: value.revision } : {}), ...(kind === "observe" ? {} : { action: value.action }) });
}
export function snapshot(value) {
  fields(value, ["version", "revision", "locations", "pending", "recordedCopies", "hasError"]);
  if (value.version !== 1 || !revision(value.revision) || typeof value.hasError !== "boolean") invalid();
  const locations = Object.freeze(list(value.locations, 8, 8).map((item, index) => {
    fields(item, ["category", "path", "defaultPath", "overridden"]);
    if (item.category !== categories[index] || !path(item.path) || !path(item.defaultPath) || typeof item.overridden !== "boolean" || item.overridden && item.category !== "plugins") invalid();
    return Object.freeze({ category: item.category, path: item.path, defaultPath: item.defaultPath, overridden: item.overridden });
  }));
  let pending = null;
  if (value.pending !== null) {
    fields(value.pending, ["action", "restartRequested", "changes"]);
    if (!["apply", "cancel"].includes(value.pending.action) || typeof value.pending.restartRequested !== "boolean") invalid();
    pending = Object.freeze({ action: value.pending.action, restartRequested: value.pending.restartRequested, changes: changes(value.pending.changes) });
  }
  let previous = -1;
  const recordedCopies = Object.freeze(list(value.recordedCopies, 0, 16).map(item => {
    fields(item, ["category", "kind", "path"]);
    const index = categories.indexOf(item.category), kind = ["previous", "archive"].indexOf(item.kind), order = index * 2 + kind;
    if (index < 0 || kind < 0 || order <= previous || !path(item.path)) invalid();
    previous = order;
    return Object.freeze({ category: item.category, kind: item.kind, path: item.path });
  }));
  const result = Object.freeze({ version: 1, revision: value.revision, locations, pending, recordedCopies, hasError: value.hasError });
  if (bytes(JSON.stringify(result)) > 127 * 1024) invalid();
  return result;
}
export function observation(value, previous) {
  fields(value, ["version", "revision", "changed"], ["snapshot"]);
  if (value.version !== 1 || !revision(value.revision)) invalid();
  if (value.changed === false) {
    if (previous === undefined || value.revision !== previous || Object.hasOwn(value, "snapshot")) invalid();
    return Object.freeze({ version: 1, revision: value.revision, changed: false });
  }
  if (value.changed !== true || value.revision === previous) invalid();
  const state = snapshot(value.snapshot);
  if (state.revision !== value.revision) invalid();
  const result = Object.freeze({ version: 1, revision: value.revision, changed: true, snapshot: state });
  if (bytes(JSON.stringify(result)) > 128 * 1024) invalid();
  return result;
}
export function changed(value, input) {
  fields(value, ["version", "outcome", "snapshot"]);
  if (value.version !== 1 || !["restartScheduled", "dismissed"].includes(value.outcome)) invalid();
  const state = snapshot(value.snapshot);
  if (value.outcome === "restartScheduled" && (!state.pending?.restartRequested || input.action === "cancel" && state.pending.action !== "cancel")) invalid();
  const result = Object.freeze({ version: 1, outcome: value.outcome, snapshot: state });
  if (bytes(JSON.stringify(result)) > 128 * 1024) invalid();
  return result;
}
