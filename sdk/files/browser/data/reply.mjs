import { bytes, identity, integer, list, pageBudget, path, record, token } from "./validation.mjs";

const invalid = () => { throw new Error("Invalid file browser response"); };
function metadata(value) {
  if (!identity(value) || !(value.tabId === null || token(value.tabId)) ||
      !(value.path === null || path(value.path)) || !integer(value.total) || !integer(value.selectedCount) ||
      typeof value.busy !== "boolean" || typeof value.suspended !== "boolean" ||
      !(value.error === null || typeof value.error === "string" && bytes(value.error) <= 2048) ||
      typeof value.errorTruncated !== "boolean" || value.error === null && value.errorTruncated ||
      !record(value.source) || !["local", "remote"].includes(value.source.kind) ||
      value.source.kind === "remote" && !token(value.source.sessionId)) invalid();
  const source = Object.freeze(value.source.kind === "local" ? { kind: "local" } : { kind: "remote", sessionId: value.source.sessionId });
  return Object.freeze({ paneId: value.paneId, tabId: value.tabId, revision: value.revision, source,
    path: value.path, total: value.total, selectedCount: value.selectedCount, busy: value.busy,
    suspended: value.suspended, error: value.error, errorTruncated: value.errorTruncated });
}
function entries(value) {
  if (!record(value) || typeof value.name !== "string" || bytes(value.name) > 4096 || /[\0\p{Cs}]/u.test(value.name) || !path(value.path) ||
      typeof value.isDir !== "boolean" || typeof value.isHidden !== "boolean" || typeof value.selected !== "boolean" ||
      !integer(value.size) || value.modified !== null && !Number.isSafeInteger(value.modified) ||
      value.permissions !== null && (!integer(value.permissions) || value.permissions > 0xffffffff)) invalid();
  return Object.freeze({ name: value.name, path: value.path, isDir: value.isDir, isHidden: value.isHidden,
    size: value.size, modified: value.modified, permissions: value.permissions, selected: value.selected });
}
function page(value, request, maximum, project) {
  if (!record(value) || !integer(value.total) || value.offset !== (request.offset ?? 0) || value.offset > value.total ||
      !list(value.items, request.limit ?? maximum)) invalid();
  const end = value.offset + value.items.length;
  if (end > value.total || (end < value.total ? value.nextOffset !== end || !value.items.length : value.nextOffset !== null)) invalid();
  const items = Object.freeze(value.items.map(project));
  if (new Set(items.map(item => item.paneId ?? item.path)).size !== items.length) invalid();
  const result = Object.freeze({ total: value.total, offset: value.offset, nextOffset: value.nextOffset, items });
  if (!pageBudget(result)) invalid();
  return result;
}
export function observation(value, request) {
  if (!record(value) || value.schemaVersion !== 1 || !token(value.revision)) invalid();
  if (value.changed === false) {
    if (request.revision === undefined || value.revision !== request.revision || "snapshot" in value) invalid();
    return Object.freeze({ schemaVersion: 1, revision: value.revision, changed: false });
  }
  if (value.changed !== true || value.revision === request.revision) invalid();
  const result = Object.freeze({ schemaVersion: 1, revision: value.revision, changed: true,
    snapshot: page(value.snapshot, request, 16, metadata) });
  if (!pageBudget(result)) invalid();
  return result;
}
export function listing(value, request) {
  if (!identity(value) || value.schemaVersion !== 1 || value.paneId !== request.paneId || value.revision !== request.revision) invalid();
  const result = Object.freeze({ schemaVersion: 1, paneId: value.paneId, revision: value.revision,
    ...page(value, request, 64, entries) });
  if (!pageBudget(result)) invalid();
  return result;
}
export function accepted(value) {
  if (!record(value) || value.accepted !== true) invalid();
  return Object.freeze({ accepted: true });
}
