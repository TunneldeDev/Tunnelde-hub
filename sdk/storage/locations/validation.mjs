const categories = ["database", "plugins", "pluginData", "keys", "runtimes", "cache", "logs", "runners"];
const bytes = value => new TextEncoder().encode(value).length;
const invalid = () => { throw new TypeError("Invalid host storage location contract"); };
const text = (value, limit) => typeof value === "string" && value.length > 0 &&
  !/[\p{Cc}\uD800-\uDFFF]/u.test(value) && bytes(value) <= limit;
const revision = value => text(value, 128);
const path = value => text(value, 4096) && /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value);
function fields(value, required, optional = []) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).some(key => typeof key !== "string" || ![...required, ...optional].includes(key) ||
        !("value" in Object.getOwnPropertyDescriptor(value, key))) || required.some(key => !Object.hasOwn(value, key))) invalid();
}
function list(value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
      Reflect.ownKeys(value).length !== value.length + 1 ||
      Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, index))
        .some(item => !item || !("value" in item))) invalid();
  return value;
}
function changes(value) {
  const seen = new Set();
  return Object.freeze(list(value, 1, 8).map(item => {
    fields(item, ["category", "target", "migrate"]);
    if (!categories.includes(item.category) || seen.has(item.category) || !path(item.target) || typeof item.migrate !== "boolean") invalid();
    seen.add(item.category);
    return Object.freeze({ category: item.category, target: item.target, migrate: item.migrate });
  }));
}
export function request(value, kind) {
  fields(value, kind === "observe" ? [] : ["revision", ...(kind === "schedule" ? ["changes"] : [])], kind === "observe" ? ["revision"] : []);
  const has = Object.hasOwn(value, "revision");
  if (has && !revision(value.revision)) invalid();
  return Object.freeze({ ...(has ? { revision: value.revision } : {}), ...(kind === "schedule" ? { changes: changes(value.changes) } : {}) });
}
export function snapshot(value) {
  fields(value, ["version", "revision", "locations", "pending", "recoveryRequired"]);
  if (value.version !== 1 || !revision(value.revision) || typeof value.recoveryRequired !== "boolean") invalid();
  const locations = Object.freeze(list(value.locations, 8, 8).map((item, index) => {
    fields(item, ["category", "path", "defaultPath", "overridden"]);
    if (item.category !== categories[index] || !path(item.path) || !path(item.defaultPath) ||
        typeof item.overridden !== "boolean" || item.overridden && item.category !== "plugins") invalid();
    return Object.freeze({ category: item.category, path: item.path, defaultPath: item.defaultPath, overridden: item.overridden });
  }));
  let pending = null;
  if (value.pending !== null) {
    fields(value.pending, ["changes"]);
    pending = Object.freeze({ changes: changes(value.pending.changes) });
  }
  const result = Object.freeze({ version: 1, revision: value.revision, locations, pending, recoveryRequired: value.recoveryRequired });
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
export function changed(value, kind) {
  fields(value, ["version", "outcome", "snapshot"]);
  if (value.version !== 1 || ![kind === "schedule" ? "scheduled" : "cancelled", "dismissed"].includes(value.outcome)) invalid();
  const state = snapshot(value.snapshot);
  if (value.outcome === "scheduled" && state.pending === null || value.outcome === "cancelled" && state.pending !== null) invalid();
  const result = Object.freeze({ version: 1, outcome: value.outcome, snapshot: state });
  if (bytes(JSON.stringify(result)) > 128 * 1024) invalid();
  return result;
}
