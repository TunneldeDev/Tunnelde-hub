import { record, validId, contentRevision } from "../content/validation.mjs";
export { record, validId, contentRevision } from "../content/validation.mjs";
export const fields = (value, allowed) => record(value) && Object.keys(value).every(key=>allowed.includes(key));
export const name = value => typeof value === "string" && value.trim().length > 0 &&
  Array.from(value.trim()).length <= 64 && !/[\p{Cc}\uD800-\uDFFF]/u.test(value);
export function draft(raw, total, offset, id) {
  if (!record(raw) || raw.version !== 1 || !validId(raw.draftId) || id !== undefined && raw.draftId !== id || raw.totalBytes !== total || raw.offset !== offset)
    throw new Error("Invalid profile draft response");
  return raw.draftId;
}
export function changed(raw, request, activated = false) {
  if (!record(raw) || raw.version !== 1 || !validId(raw.id) || request.id !== undefined && raw.id !== request.id ||
    !contentRevision(raw.revision) || (activated ? raw.revision !== request.revision || !validId(raw.preferencesRevision) || raw.preferencesRevision === request.preferencesRevision : raw.revision === request.revision))
    throw new Error("Invalid profile mutation response; reconcile catalogue before retrying");
  return Object.freeze({version:1,id:raw.id,revision:raw.revision,...(activated?{preferencesRevision:raw.preferencesRevision}:{})});
}
