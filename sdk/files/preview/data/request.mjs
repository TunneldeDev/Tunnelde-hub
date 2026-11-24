import { absolute, endpointCopy, fields, identity, integer, source, token } from "./validation.mjs";

const invalid = () => { throw new TypeError("Invalid file preview request"); };
export function observationRequest(value = {}) {
  if (!fields(value, ["revision"]) || Object.hasOwn(value, "revision") && !token(value.revision)) invalid();
  return Object.freeze(Object.hasOwn(value, "revision") ? { revision: value.revision } : {});
}
export function providersRequest(value) {
  if (!identity(value) || !fields(value, ["id", "revision", "offset", "limit"]) ||
      Object.hasOwn(value, "offset") && !integer(value.offset) ||
      Object.hasOwn(value, "limit") && (!integer(value.limit) || value.limit < 1 || value.limit > 32)) invalid();
  return Object.freeze({ id: value.id, revision: value.revision,
    ...(Object.hasOwn(value, "offset") ? { offset: value.offset } : {}),
    ...(Object.hasOwn(value, "limit") ? { limit: value.limit } : {}) });
}
export function actionRequest(value) {
  if (!identity(value)) invalid();
  const names = value.action === "selectProvider" ? ["providerId"]
    : ["close", "retry", "dock", "undock"].includes(value.action) ? [] : null;
  if (!names || !fields(value, ["id", "revision", "action", ...names]) ||
      value.action === "selectProvider" && !token(value.providerId, 129)) invalid();
  return Object.freeze({ id: value.id, revision: value.revision, action: value.action,
    ...(names.length ? { providerId: value.providerId } : {}) });
}
export function openRequest(value) {
  if (!fields(value, ["source", "path", "line", "column"]) || !source(value.source) ||
      !absolute(value.path, value.source) ||
      Object.hasOwn(value, "line") && !integer(value.line) ||
      Object.hasOwn(value, "column") && !integer(value.column)) invalid();
  return Object.freeze({ source: endpointCopy(value.source), path: value.path,
    ...(Object.hasOwn(value, "line") ? { line: value.line } : {}),
    ...(Object.hasOwn(value, "column") ? { column: value.column } : {}) });
}
