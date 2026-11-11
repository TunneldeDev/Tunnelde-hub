export const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
export const bytes = value => new TextEncoder().encode(value).length;
export const integer = value => Number.isSafeInteger(value) && value >= 0;
export const identifier = value => typeof value === "string" && value.length > 0 && value.length <= 1024 && !value.includes("\0");
export const validRevision = value => typeof value === "string" && value.length > 0 && bytes(value) <= 128 && !/\p{Cc}/u.test(value);
export const identity = value => record(value) && identifier(value.tabId) && identifier(value.documentId) && integer(value.version);
export const sameIdentity = (a, b) => a.tabId === b.tabId && a.documentId === b.documentId && a.version === b.version;
export const projectIdentity = value => ({ tabId: value.tabId, documentId: value.documentId, version: value.version });
export const wellFormed = value => {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
};
export function fields(value, keys) {
  return record(value) && Object.keys(value).every(key => keys.includes(key));
}
