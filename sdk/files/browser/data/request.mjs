import { fields, identity, integer, list, path, token } from "./validation.mjs";

const invalid = () => { throw new TypeError("Invalid file browser request"); };
function paging(value, maximum) {
  if (Object.hasOwn(value, "offset") && !integer(value.offset) ||
      Object.hasOwn(value, "limit") && (!integer(value.limit) || value.limit < 1 || value.limit > maximum)) invalid();
  return { ...(Object.hasOwn(value, "offset") ? { offset: value.offset } : {}),
    ...(Object.hasOwn(value, "limit") ? { limit: value.limit } : {}) };
}
export function observationRequest(value = {}) {
  if (!fields(value, ["offset", "limit", "revision"]) || Object.hasOwn(value, "revision") && !token(value.revision)) invalid();
  return Object.freeze({ ...paging(value, 32), ...(Object.hasOwn(value, "revision") ? { revision: value.revision } : {}) });
}
export function readRequest(value) {
  if (!fields(value, ["paneId", "revision", "offset", "limit"]) || !identity(value)) invalid();
  return Object.freeze({ paneId: value.paneId, revision: value.revision, ...paging(value, 256) });
}
export function actionRequest(value) {
  if (!identity(value)) invalid();
  const names = value.action === "refresh" ? [] : value.action === "navigate" ? ["path"]
    : value.action === "select" ? ["paths"] : value.action === "open" ? ["path", "mode"] : null;
  if (!names || !fields(value, ["paneId", "revision", "action", ...names])) invalid();
  const result = { paneId: value.paneId, revision: value.revision, action: value.action };
  if (value.action === "select") {
    if (!list(value.paths, 256) ||
        value.paths.some(item => !path(item)) || new Set(value.paths).size !== value.paths.length) invalid();
    result.paths = Object.freeze([...value.paths]);
  } else if (value.action !== "refresh") {
    if (!path(value.path)) invalid();
    result.path = value.path;
    if (value.action === "open" && Object.hasOwn(value, "mode")) {
      if (!["open", "preview"].includes(value.mode)) invalid();
      result.mode = value.mode;
    }
  }
  return Object.freeze(result);
}
