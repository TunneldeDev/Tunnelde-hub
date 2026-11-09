import assert from "node:assert/strict";

const object = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const plain = (value, max) => typeof value === "string" && value.trim() && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
const finite = (value) => typeof value === "number" && Number.isFinite(value);

/** Match the native inert metadata schema; unknown fields fail closed. */
export function validateHostFields(schema, permissions) {
  if (schema === undefined || schema === null) return;
  assert.ok(object(schema,["version","fields"]) && Number.isInteger(schema.version) && schema.version >= 1 && schema.version <= 65535 &&
    Array.isArray(schema.fields) && schema.fields.length >= 1 && schema.fields.length <= 32 && permissions.includes("hosts.read"), "Invalid host fields schema or missing hosts.read permission");
  const ids = new Set();
  for (const field of schema.fields) {
    assert.ok(object(field,["id","label","type","description","maxLength","minimum","maximum","options"]) &&
      typeof field.id === "string" && /^[a-zA-Z0-9._-]{1,64}$/.test(field.id) && !ids.has(field.id) && plain(field.label,120) &&
      ["text","number","boolean","select"].includes(field.type) &&
      (field.description == null || plain(field.description,512)) &&
      (field.maxLength == null || (field.type === "text" && Number.isInteger(field.maxLength) && field.maxLength >= 1 && field.maxLength <= 4096)) &&
      (field.minimum == null || (field.type === "number" && finite(field.minimum))) &&
      (field.maximum == null || (field.type === "number" && finite(field.maximum))) &&
      (field.minimum == null || field.maximum == null || field.minimum <= field.maximum), "Invalid host field declaration");
    ids.add(field.id);
    const options = field.options === undefined ? [] : field.options;
    assert.ok(Array.isArray(options) && (field.type === "select" ? options.length >= 1 && options.length <= 64 : options.length === 0), "Invalid host field options");
    const choices = new Set();
    for (const option of options) {
      assert.ok(object(option,["value","label"]) && plain(option.value,128) && plain(option.label,120) && !choices.has(option.value), "Invalid host field choice");
      choices.add(option.value);
    }
  }
}
