const encoder = new TextEncoder();
export const bytes = value => encoder.encode(value).length;
export const record = value => value !== null && typeof value === "object" && !Array.isArray(value) &&
  [null, Object.prototype].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).every(key => typeof key === "string" && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), "value"));
export const fields = (value, names) => record(value) && Object.keys(value).every(key => names.includes(key));
export const integer = value => Number.isSafeInteger(value) && value >= 0;
export const token = value => typeof value === "string" && value.length > 0 && bytes(value) <= 128 && !/[\p{Cc}\p{Cs}]/u.test(value);
export const path = value => typeof value === "string" && value.length > 0 && bytes(value) <= 32768 && !/[\0\p{Cs}]/u.test(value);
export const list = (value, maximum) => Array.isArray(value) && value.length <= maximum &&
  Reflect.ownKeys(value).length === value.length + 1 &&
  Array.from({ length: value.length }, (_, i) => Object.getOwnPropertyDescriptor(value, String(i))).every(item => item && Object.hasOwn(item, "value"));
export const identity = value => record(value) && token(value.paneId) && token(value.revision);
export const pageBudget = value => bytes(JSON.stringify(value)) <= 65536;
