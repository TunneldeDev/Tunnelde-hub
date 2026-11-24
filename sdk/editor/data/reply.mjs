import { identity, integer, projectIdentity, record, sameIdentity, validRevision, wellFormed } from "./validation.mjs";

const invalid = () => { throw new Error("Invalid editor buffer response"); };
function metadata(value, tabId) {
  if (value === null) return null;
  if (!identity(value) || tabId !== undefined && value.tabId !== tabId ||
      typeof value.path !== "string" || typeof value.name !== "string" ||
      !integer(value.utf16Length) || typeof value.dirty !== "boolean") invalid();
  return Object.freeze({ ...projectIdentity(value), path: value.path, name: value.name,
    utf16Length: value.utf16Length, dirty: value.dirty });
}

export function observation(value, request) {
  if (!record(value) || value.schemaVersion !== 1 || !validRevision(value.revision)) invalid();
  if (value.changed === false) {
    if (request.revision === undefined || value.revision !== request.revision || "snapshot" in value) invalid();
    return Object.freeze({ schemaVersion: 1, revision: value.revision, changed: false });
  }
  if (value.changed !== true || value.revision === request.revision) invalid();
  return Object.freeze({ schemaVersion: 1, revision: value.revision, changed: true, snapshot: metadata(value.snapshot, request.tabId) });
}

export function range(value, request) {
  if (!identity(value) || value.schemaVersion !== 1 || !sameIdentity(value, request) || value.offset !== request.offset ||
      !integer(value.totalLength) || typeof value.text !== "string" || !wellFormed(value.text) ||
      value.offset > value.totalLength || value.text.length > (request.limit ?? 16384)) invalid();
  const end = value.offset + value.text.length;
  if (end > value.totalLength || (end < value.totalLength ? value.nextOffset !== end || !value.text.length : value.nextOffset !== null)) invalid();
  return Object.freeze({ schemaVersion: 1, ...projectIdentity(value), offset: value.offset,
    totalLength: value.totalLength, text: value.text, nextOffset: value.nextOffset });
}

export function applied(value, request) {
  if (!identity(value) || value.schemaVersion !== 1 || value.tabId !== request.tabId || value.documentId !== request.documentId ||
      (value.version !== request.version && value.version !== request.version + 1) || !integer(value.utf16Length) ||
      value.utf16Length > 2 * 1024 * 1024 || typeof value.dirty !== "boolean") invalid();
  return Object.freeze({ schemaVersion: 1, ...projectIdentity(value), dirty: value.dirty, utf16Length: value.utf16Length });
}
