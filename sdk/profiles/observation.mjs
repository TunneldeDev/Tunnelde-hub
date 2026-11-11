const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const validText = value => typeof value === "string" && value.length > 0 &&
  !/[\p{Cc}\uD800-\uDFFF]/u.test(value);
export const validRevision = value => validText(value) && new TextEncoder().encode(value).length <= 128;

/** Copy known public fields only; raw transport envelopes never reach observers. */
export function observation(value, previous) {
  const invalid = () => { throw new Error("Invalid profile observation"); };
  if (!record(value) || value.version !== 1 || !validRevision(value.revision)) invalid();
  if (value.changed === false) {
    if (previous === undefined || value.revision !== previous || "snapshot" in value) invalid();
    return Object.freeze({ version: 1, revision: value.revision, changed: false });
  }
  const snapshot = value.snapshot;
  if (value.changed !== true || value.revision === previous || !record(snapshot) ||
      snapshot.version !== 1 || snapshot.revision !== value.revision ||
      !Array.isArray(snapshot.items) || snapshot.items.length > 32) invalid();
  const ids = new Set(), names = new Set();
  const items = snapshot.items.map(item => {
    if (!record(item) || !validRevision(item.id) || ids.has(item.id) ||
        !validText(item.name) || Array.from(item.name).length > 64 ||
        /^\p{White_Space}|\p{White_Space}$/u.test(item.name) || names.has(item.name.toLowerCase()) ||
        !Number.isSafeInteger(item.updatedAt) || item.updatedAt < 0) invalid();
    ids.add(item.id); names.add(item.name.toLowerCase());
    return Object.freeze({ id: item.id, name: item.name, updatedAt: item.updatedAt });
  });
  const result = { version: 1, revision: value.revision, changed: true,
    snapshot: Object.freeze({ version: 1, revision: value.revision, items: Object.freeze(items) }) };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 32 * 1024) invalid();
  return Object.freeze(result);
}
