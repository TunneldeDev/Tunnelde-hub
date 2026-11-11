export const CHUNK_BYTES = 49152;
export const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const safe = value => Number.isSafeInteger(value) && value >= 0;
export const id = value => typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
export function keys(value, allowed) {
  if (!record(value) || Object.keys(value).some(key => !allowed.includes(key)))
    throw new TypeError("Invalid file content fields");
}
export function preparation(input) {
  keys(input, ["source", "path"]);
  const source = input.source;
  if (!record(source) || !["local", "remote"].includes(source.kind)) throw new TypeError("An explicit file source is required");
  keys(source, source.kind === "local" ? ["kind"] : ["kind", "sessionId"]);
  if (source.kind === "remote" && (typeof source.sessionId !== "string" || !source.sessionId || source.sessionId.length > 128 || /[\x00-\x1f\x7f]/.test(source.sessionId)))
    throw new TypeError("Invalid SSH session identity");
  if (typeof input.path !== "string" || !input.path || input.path.includes("\0") || new TextEncoder().encode(input.path).length > 32768 ||
      !(input.path.startsWith("/") || source.kind === "local" && /^(?:[a-z]:[\\/]|\\\\)/i.test(input.path)))
    throw new TypeError("An absolute file path is required");
  return { source: { ...source }, path: input.path };
}
export function range(input, size) {
  keys(input, ["offset", "length"]);
  if (!safe(input.offset) || input.offset > size || !Number.isInteger(input.length) || input.length < 1 || input.length > CHUNK_BYTES)
    throw new RangeError("Invalid file content byte range");
  return { offset: input.offset, length: input.length };
}
