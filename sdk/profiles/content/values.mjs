import schema from "../../preferences/schema.mjs";
import { record } from "./validation.mjs";

// Only the fixed, mirrored public preference vocabulary is interpreted. This is
// not a plugin-supplied schema engine or a projection of arbitrary native stores.
function valid(rule, value, depth = 0) {
  if (!record(rule) || depth > 24) return false;
  if (rule.anyOf) return rule.anyOf.some(choice => valid(choice, value, depth + 1));
  if (rule.enum && !rule.enum.includes(value)) return false;
  switch (rule.type) {
    case "null": return value === null;
    case "boolean": return typeof value === "boolean";
    case "string": return typeof value === "string" && !/[\uD800-\uDFFF]/u.test(value) &&
      (rule.maxLength === undefined || Array.from(value).length <= rule.maxLength) &&
      (rule["x-maxBytes"] === undefined || new TextEncoder().encode(value).length <= rule["x-maxBytes"]);
    case "integer":
    case "number": return typeof value === "number" && Number.isFinite(value) &&
      (rule.type !== "integer" || Number.isSafeInteger(value)) &&
      (rule.minimum === undefined || value >= rule.minimum) && (rule.maximum === undefined || value <= rule.maximum) &&
      (rule.multipleOf === undefined || Math.abs(value / rule.multipleOf - Math.round(value / rule.multipleOf)) <= 1e-9);
    case "array": return Array.isArray(value) && (rule.maxItems === undefined || value.length <= rule.maxItems) &&
      value.every(item => valid(rule.items, item, depth + 1));
    case "object": return record(value) && (rule.maxProperties === undefined || Object.keys(value).length <= rule.maxProperties) &&
      (rule.required ?? []).every(key => Object.hasOwn(value, key)) && Object.entries(value).every(([key, item]) =>
        (!rule.propertyNames || valid(rule.propertyNames, key, depth + 1)) &&
        valid(Object.hasOwn(rule.properties ?? {}, key) ? rule.properties[key] : rule.additionalProperties, item, depth + 1));
    default: return false;
  }
}
function freeze(value) {
  if (value && typeof value === "object") { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}
export function profileValues(text) {
  try {
    const value = JSON.parse(text);
    if (!record(value) || Object.keys(value).length !== Object.keys(schema.groups).length ||
        !Object.entries(schema.groups).every(([id, group]) => Object.hasOwn(value, id) && valid(group, value[id])))
      throw new Error();
    return freeze(value);
  } catch { throw new Error("Invalid public profile values"); }
}
