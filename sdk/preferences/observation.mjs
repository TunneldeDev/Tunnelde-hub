function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validRevision(value) {
  return typeof value === "string" && value.length > 0 &&
    new TextEncoder().encode(value).length <= 128 && !/\p{Cc}/u.test(value);
}

function frozen(value) {
  const copy = structuredClone(value), pending = [copy], seen = new Set();
  while (pending.length) {
    const item = pending.pop();
    if (!record(item) && !Array.isArray(item) || seen.has(item)) continue;
    seen.add(item);
    pending.push(...Object.values(item));
    Object.freeze(item);
  }
  return copy;
}

/** Never pass raw transport envelopes or unknown top-level fields to observers. */
export function observation(value, previous) {
  const invalid = () => { throw new Error("Invalid preference observation"); };
  if (!record(value) || value.version !== 1 || !validRevision(value.revision)) invalid();
  if (value.changed === false) {
    if (previous === undefined || value.revision !== previous || "snapshot" in value) invalid();
    return Object.freeze({ version: 1, revision: value.revision, changed: false });
  }
  const snapshot = value.snapshot;
  if (value.changed !== true || value.revision === previous || !record(snapshot) ||
      snapshot.version !== 1 || snapshot.revision !== value.revision ||
      !record(snapshot.values) || !record(snapshot.defaults)) invalid();
  return Object.freeze({
    version: 1, revision: value.revision, changed: true,
    snapshot: frozen({ version: 1, revision: snapshot.revision, values: snapshot.values, defaults: snapshot.defaults }),
  });
}
