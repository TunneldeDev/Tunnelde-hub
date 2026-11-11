const encoder = new TextEncoder();
const MAX_DECODED = 512 * 1024;
const record = value => value !== null && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const unicode = value => typeof value === "string" && !/[\uD800-\uDFFF]/u.test(value);
export const validRevision = value => unicode(value) && value.length > 0 &&
  !/\p{Cc}/u.test(value) && value.length <= 128 && encoder.encode(value).length <= 128;
const key = value => value.length > 0 && value.length <= 128 && !/[^A-Za-z0-9._-]/.test(value) &&
  !["__proto__", "constructor", "prototype"].includes(value);
const invalid = () => { throw new Error("Invalid plugin storage observation"); };

/** JSON was decoded by the transport. Rust and ECMAScript spell small floating
 * numbers differently (1e-6 vs 0.000001). The host bounds the actual map to256KiB;
 * this separate decoded-work budget permits up to2x reserialization expansion.
 * Copy own data properties only and preserve nested __proto__ as data safely. */
function copyValues(values) {
  if (!record(values)) invalid();
  let remaining = MAX_DECODED;
  const active = new WeakSet();
  const charge = count => { remaining -= count; if (remaining < 0) invalid(); };
  const text = value => {
    if (!unicode(value) || value.length > remaining) invalid();
    charge(encoder.encode(JSON.stringify(value)).length);
    return value;
  };
  const copy = (value, depth) => {
    if (depth > 64) invalid();
    if (value === null || typeof value === "boolean") { charge(value === null ? 4 : value ? 4 : 5); return value; }
    if (typeof value === "string") return text(value);
    if (typeof value === "number") {
      if (!Number.isFinite(value) || Number.isInteger(value) && !Number.isSafeInteger(value)) invalid();
      charge(JSON.stringify(value).length); return value;
    }
    if (!Array.isArray(value) && !record(value) || value === null || active.has(value)) invalid();
    active.add(value); charge(2);
    let result;
    if (Array.isArray(value)) {
      // Each item needs at least one JSON byte; reject huge/sparse arrays first.
      if (value.length > remaining || Object.keys(value).length !== value.length) invalid();
      result = [];
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
        if (!descriptor || !("value" in descriptor)) invalid();
        if (i) charge(1);
        result.push(copy(descriptor.value, depth + 1));
      }
    } else {
      result = {}; let first = true;
      for (const name of Object.keys(value)) {
        if (depth === 0 && !key(name)) invalid();
        const descriptor = Object.getOwnPropertyDescriptor(value, name);
        if (!descriptor || !("value" in descriptor)) invalid();
        if (!first) charge(1); first = false;
        text(name); charge(1);
        Object.defineProperty(result, name, { value: copy(descriptor.value, depth + 1), enumerable: true });
      }
    }
    active.delete(value);
    return Object.freeze(result);
  };
  return copy(values, 0);
}

/** Keep only the public contract, never leak unknown envelope fields. */
export function observation(value, previous) {
  if (!record(value) || value.version !== 1 || !validRevision(value.revision)) invalid();
  if (value.changed === false) {
    if (previous === undefined || value.revision !== previous || "snapshot" in value) invalid();
    return Object.freeze({ version: 1, revision: value.revision, changed: false });
  }
  const snapshot = value.snapshot;
  if (value.changed !== true || value.revision === previous || !record(snapshot) ||
      snapshot.version !== 1 || snapshot.revision !== value.revision) invalid();
  return Object.freeze({ version: 1, revision: value.revision, changed: true,
    snapshot: Object.freeze({ version: 1, revision: value.revision, values: copyValues(snapshot.values) }) });
}
