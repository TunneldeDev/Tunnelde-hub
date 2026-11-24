import { CHUNK_BYTES, id, keys, safe } from "./request.mjs";

export function prepared(value) {
  keys(value, ["version", "contentId", "leaseMs"]);
  if (value.version !== 1 || !id(value.contentId) || value.leaseMs !== 20000) throw new TypeError("Invalid prepared content reply");
  return Object.freeze({ ...value });
}
export function observation(value, contentId, opened = false) {
  keys(value, ["version", "contentId", "state", "size", "chunkBytes", "leaseMs"]);
  if (value.version !== 1 || value.contentId !== contentId || !["prepared", "opening", "open", "closed"].includes(value.state) ||
      value.chunkBytes !== CHUNK_BYTES || !safe(value.leaseMs) || value.leaseMs > 60000 ||
      (value.state === "open" ? !safe(value.size) : value.size !== null) ||
      value.state === "closed" && value.leaseMs !== 0 || opened && value.state !== "open")
    throw new TypeError("Invalid file content observation");
  return Object.freeze({ ...value });
}
export function closed(value) {
  keys(value, ["version", "closed"]);
  if (value.version !== 1 || value.closed !== true) throw new TypeError("Invalid file content close reply");
  return Object.freeze({ ...value });
}
export function bytes(value, contentId, request, size) {
  keys(value, ["version", "contentId", "offset", "bytes", "data", "eof"]);
  const count = Math.min(request.length, size - request.offset);
  if (value.version !== 1 || value.contentId !== contentId || value.offset !== request.offset || value.bytes !== count ||
      typeof value.data !== "string" || value.data.length > 65536 || value.eof !== (request.offset + count >= size))
    throw new TypeError("Invalid file content range reply");
  let decoded;
  try { decoded = atob(value.data); }
  catch { throw new TypeError("Invalid file content base64"); }
  if (decoded.length !== count || btoa(decoded) !== value.data) throw new TypeError("Invalid file content base64 length or encoding");
  return Uint8Array.from(decoded, character => character.charCodeAt(0));
}
