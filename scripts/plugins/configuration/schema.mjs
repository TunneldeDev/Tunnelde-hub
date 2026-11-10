import assert from "node:assert/strict";

export const key = value => typeof value === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(value) && !["__proto__","prototype","constructor"].includes(value);
export const object = (value, allowed) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => allowed.includes(key));
const integer = (value,min,max) => Number.isSafeInteger(value) && value >= min && value <= max;

export function validateDefinition(schema, depth = 0, count = { nodes: 0 }) {
  assert.ok(depth <= 8 && ++count.nodes <= 512 && schema && typeof schema === "object");
  switch (schema.type) {
    case "boolean": assert.ok(object(schema,["type"])); break;
    case "string": {
      assert.ok(object(schema,["type","maxLength","minLength","enum"]) && integer(schema.maxLength,0,16384) &&
        (schema.minLength == null || integer(schema.minLength,0,schema.maxLength)));
      if (schema.enum != null) assert.ok(Array.isArray(schema.enum) && schema.enum.length >= 1 && schema.enum.length <= 128 &&
        new Set(schema.enum).size === schema.enum.length && schema.enum.every(value => validValue({...schema,enum:undefined},value)));
      break;
    }
    case "number": case "integer":
      assert.ok(object(schema,["type","minimum","maximum"]) && typeof schema.minimum === "number" && Number.isFinite(schema.minimum) &&
        typeof schema.maximum === "number" && Number.isFinite(schema.maximum) && schema.minimum <= schema.maximum &&
        (schema.type !== "integer" || (Number.isSafeInteger(schema.minimum) && Number.isSafeInteger(schema.maximum))));
      break;
    case "array":
      assert.ok(object(schema,["type","items","maxItems"]) && integer(schema.maxItems,0,256));
      validateDefinition(schema.items,depth+1,count); break;
    case "object":
      assert.ok(object(schema,["type","properties","required","additionalProperties"]) && schema.additionalProperties === false &&
        schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties) && Object.keys(schema.properties).length <= 64 &&
        Object.keys(schema.properties).every(key) && Array.isArray(schema.required) && new Set(schema.required).size === schema.required.length &&
        schema.required.every(name => Object.hasOwn(schema.properties,name)));
      for (const child of Object.values(schema.properties)) validateDefinition(child,depth+1,count);
      break;
    default: assert.fail("Unsupported configuration schema type");
  }
}

export function validValue(schema,value) {
  switch (schema.type) {
    case "boolean": return typeof value === "boolean";
    case "number": case "integer": return typeof value === "number" && Number.isFinite(value) && value >= schema.minimum && value <= schema.maximum && (schema.type !== "integer" || Number.isInteger(value));
    case "string": return typeof value === "string" && !value.includes("\0") && [...value].length >= (schema.minLength ?? 0) && [...value].length <= schema.maxLength && (schema.enum == null || schema.enum.includes(value));
    case "array": return Array.isArray(value) && value.length <= schema.maxItems && value.every(child => validValue(schema.items,child));
    case "object": return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => Object.hasOwn(schema.properties,key)) && schema.required.every(key => Object.hasOwn(value,key)) && Object.entries(value).every(([key,child]) => validValue(schema.properties[key],child));
    default: return false;
  }
}
