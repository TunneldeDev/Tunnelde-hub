export const categories = ["database", "plugins", "pluginData", "keys", "runtimes", "cache", "logs", "runners"];
export const bytes = value => new TextEncoder().encode(value).length;
export const invalid = () => { throw new TypeError("Invalid host storage recovery contract"); };
export const text = (value, limit) => typeof value === "string" && value.length > 0 &&
  !/[\p{Cc}\uD800-\uDFFF]/u.test(value) && bytes(value) <= limit;
export const revision = value => text(value, 128);
export const path = value => text(value, 4096) && /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(value);
export function fields(value, required, optional = []) {
  if (!value || typeof value !== "object" || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).some(key => typeof key !== "string" || ![...required, ...optional].includes(key) ||
        !("value" in Object.getOwnPropertyDescriptor(value, key))) || required.some(key => !Object.hasOwn(value, key))) invalid();
}
export function list(value, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max ||
      Reflect.ownKeys(value).length !== value.length + 1 ||
      Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, index))
        .some(item => !item || !("value" in item))) invalid();
  return value;
}
export function changes(value) {
  const seen = new Set();
  return Object.freeze(list(value, 1, 8).map(item => {
    fields(item, ["category", "target", "migrate"]);
    if (!categories.includes(item.category) || seen.has(item.category) || !path(item.target) || typeof item.migrate !== "boolean") invalid();
    seen.add(item.category);
    return Object.freeze({ category: item.category, target: item.target, migrate: item.migrate });
  }));
}
