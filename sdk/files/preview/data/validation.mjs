const encoder = new TextEncoder();
export const bytes = value => encoder.encode(value).length;
export const record = value => value !== null && typeof value === "object" && !Array.isArray(value) &&
  [null, Object.prototype].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).every(key => typeof key === "string" && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
export const fields = (value, names) => record(value) && Object.keys(value).every(key => names.includes(key));
export const integer = value => Number.isSafeInteger(value) && value >= 0;
export const token = (value, maximum = 128) => typeof value === "string" && value.length > 0 && bytes(value) <= maximum && !/[\p{Cc}\p{Cs}]/u.test(value);
export const path = value => typeof value === "string" && value.length > 0 && bytes(value) <= 32768 && !/[\0\p{Cs}]/u.test(value);
export const source = value => record(value) && fields(value, value?.kind === "local" ? ["kind"] : ["kind", "sessionId"]) &&
  (value.kind === "local" || value.kind === "remote" && token(value.sessionId));
export const absolute = (value, endpoint) => path(value) &&
  (endpoint.kind === "remote" ? value.startsWith("/") : /^(?:\/|[a-zA-Z]:[\\/]|\\\\[^\\]+\\[^\\]+)/.test(value));
export const identity = value => record(value) && token(value.id) && token(value.revision);
export const renderer = value => ["text", "markdown", "image", "audio", "video", "pdf"].includes(value);
export const list = (value, maximum) => Array.isArray(value) && value.length <= maximum &&
  Reflect.ownKeys(value).length === value.length + 1 &&
  Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i))).every(item => item && Object.hasOwn(item, "value"));
export const budget = (value, maximum) => bytes(JSON.stringify(value)) <= maximum;
export const endpointCopy = value => Object.freeze(value.kind === "local" ? { kind: "local" } : { kind: "remote", sessionId: value.sessionId });
