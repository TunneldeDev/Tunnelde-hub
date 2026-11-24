import { absolute, budget, bytes, endpointCopy, identity, integer, list, record, renderer, source, token } from "./validation.mjs";

const invalid = () => { throw new Error("Invalid file preview response"); };
function metadata(value) {
  if (!identity(value) || !token(value.attemptId) || !source(value.source) || !absolute(value.path, value.source) ||
      !integer(value.line) || !integer(value.column) || !["quickLook", "docked"].includes(value.presentation) ||
      !renderer(value.renderer) || !(value.providerId === null || token(value.providerId, 129)) ||
      !integer(value.providerCount) || (value.providerId !== null && value.providerCount === 0)) invalid();
  if (["loading", "ready"].includes(value.state)) { if (value.errorCode !== null) invalid(); }
  else if (value.state === "error") { if (!["readFailed", "decodeFailed"].includes(value.errorCode)) invalid(); }
  else if (value.state === "unavailable") {
    if (value.errorCode !== "rendererUnavailable" || value.providerId !== null || value.providerCount !== 0) invalid();
  } else invalid();
  return Object.freeze({ id: value.id, revision: value.revision, attemptId: value.attemptId,
    source: endpointCopy(value.source), path: value.path, line: value.line, column: value.column,
    presentation: value.presentation, renderer: value.renderer, providerId: value.providerId,
    providerCount: value.providerCount, state: value.state, errorCode: value.errorCode });
}
export function observation(value, request) {
  if (!record(value) || value.schemaVersion !== 1 || !token(value.revision)) invalid();
  if (value.changed === false) {
    if (request.revision === undefined || value.revision !== request.revision || "snapshot" in value) invalid();
    return Object.freeze({ schemaVersion: 1, revision: value.revision, changed: false });
  }
  if (value.changed !== true || value.revision === request.revision) invalid();
  const result = Object.freeze({ schemaVersion: 1, revision: value.revision, changed: true,
    snapshot: value.snapshot === null ? null : metadata(value.snapshot) });
  if (!budget(result, 262144)) invalid();
  return result;
}
export function providers(value, request) {
  if (!identity(value) || value.schemaVersion !== 1 || value.id !== request.id || value.revision !== request.revision ||
      !integer(value.total) || value.offset !== (request.offset ?? 0) || value.offset > value.total ||
      !list(value.items, request.limit ?? 16)) invalid();
  const end = value.offset + value.items.length;
  if (end > value.total || (end < value.total ? value.nextOffset !== end || !value.items.length : value.nextOffset !== null)) invalid();
  const items = Object.freeze(value.items.map(item => {
    if (!record(item) || !token(item.id, 129) || typeof item.name !== "string" || !item.name.trim() || bytes(item.name) > 120 ||
        [...item.name].length > 120 || /[\p{Cc}\p{Cs}]/u.test(item.name) || !renderer(item.renderer)) invalid();
    return Object.freeze({ id: item.id, name: item.name, renderer: item.renderer });
  }));
  if (new Set(items.map(item => item.id)).size !== items.length) invalid();
  const result = Object.freeze({ schemaVersion: 1, id: value.id, revision: value.revision,
    total: value.total, offset: value.offset, nextOffset: value.nextOffset, items });
  if (!budget(result, 65536)) invalid();
  return result;
}
export function accepted(value) {
  if (!record(value) || value.schemaVersion !== 1 || value.accepted !== true) invalid();
  return Object.freeze({ schemaVersion: 1, accepted: true });
}
