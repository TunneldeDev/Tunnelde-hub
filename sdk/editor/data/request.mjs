import { bytes, fields, identifier, identity, integer, projectIdentity, validRevision, wellFormed } from "./validation.mjs";

const invalid = () => { throw new TypeError("Invalid editor buffer request"); };
export function observationRequest(value = {}) {
  if (!fields(value, ["tabId", "revision"]) || Object.hasOwn(value, "tabId") && !identifier(value.tabId) ||
      Object.hasOwn(value, "revision") && !validRevision(value.revision)) invalid();
  return Object.freeze({ ...(Object.hasOwn(value, "tabId") ? { tabId: value.tabId } : {}),
    ...(Object.hasOwn(value, "revision") ? { revision: value.revision } : {}) });
}

export function rangeRequest(value) {
  if (!fields(value, ["tabId", "documentId", "version", "offset", "limit"]) || !identity(value) ||
      !integer(value.offset) || Object.hasOwn(value, "limit") && (!integer(value.limit) || value.limit < 2 || value.limit > 16384)) invalid();
  return Object.freeze({ ...projectIdentity(value), offset: value.offset,
    ...(Object.hasOwn(value, "limit") ? { limit: value.limit } : {}) });
}

export function editsRequest(value) {
  if (!fields(value, ["tabId", "documentId", "version", "edits"]) || !identity(value) ||
      !Array.isArray(value.edits) || value.edits.length > 128) invalid();
  let lastStart = -1, lastEnd = 0, size = 0;
  const edits = value.edits.map(edit => {
    if (!fields(edit, ["start", "end", "text"]) || !integer(edit.start) || !integer(edit.end) ||
        edit.start <= lastStart || edit.start < lastEnd || edit.end < edit.start ||
        typeof edit.text !== "string" || !wellFormed(edit.text)) invalid();
    size += bytes(edit.text);
    if (size > 65536) invalid();
    lastStart = edit.start; lastEnd = edit.end;
    return Object.freeze({ start: edit.start, end: edit.end, text: edit.text });
  });
  return Object.freeze({ ...projectIdentity(value), edits: Object.freeze(edits) });
}
