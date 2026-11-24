import { MAX_CONTENT_BYTES, MAX_CHUNK_BYTES } from "./limits.mjs";
import { observation } from "../observation.mjs";

export { MAX_CONTENT_BYTES, MAX_CHUNK_BYTES } from "./limits.mjs";
export const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const validId = value => typeof value === "string" && value.length > 0 &&
  new TextEncoder().encode(value).length <= 128 && !/[\p{Cc}\uD800-\uDFFF]/u.test(value);
export const contentRevision = value => typeof value === "string" && /^pc1:[0-9a-f]{64}$(?![\s\S])/.test(value);
const invalid = () => { throw new Error("Invalid profile content response"); };

export function catalogue(raw) {
  if (!record(raw) || raw.version !== 1 || !contentRevision(raw.revision)) invalid();
  const snapshot = observation({ version: 1, revision: raw.revision, changed: true,
    snapshot: { version: 1, revision: raw.revision, items: raw.items } }).snapshot;
  if (raw.activeId !== null && (!validId(raw.activeId) || !snapshot.items.some(item => item.id === raw.activeId))) invalid();
  return Object.freeze({ ...snapshot, activeId: raw.activeId });
}

export function chunk(raw, request, previousTotal) {
  if (!record(raw) || raw.version !== 1 || raw.id !== request.id || raw.revision !== request.revision ||
      raw.offset !== request.offset || !Number.isSafeInteger(raw.totalBytes) || raw.totalBytes < 2 ||
      raw.totalBytes > MAX_CONTENT_BYTES || previousTotal !== undefined && raw.totalBytes !== previousTotal ||
      typeof raw.text !== "string" || /[\uD800-\uDFFF]/u.test(raw.text)) invalid();
  const bytes = new TextEncoder().encode(raw.text).length;
  const next = request.offset + bytes;
  if (bytes > request.limit || next > raw.totalBytes ||
      (next === raw.totalBytes ? raw.nextOffset !== null : bytes === 0 || raw.nextOffset !== next)) invalid();
  const result = { version: 1, id: request.id, revision: request.revision, offset: request.offset,
    totalBytes: raw.totalBytes, text: raw.text, nextOffset: raw.nextOffset };
  if (new TextEncoder().encode(JSON.stringify(result)).length > 131_072) invalid();
  return Object.freeze(result);
}
