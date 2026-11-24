import assert from "node:assert/strict";
import { key,object,validateDefinition,validValue } from "./schema.mjs";

const plain = (value,max) => typeof value === "string" && value.trim() && [...value].length <= max && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const version = value => Number.isInteger(value) && value >= 1 && value <= 65535;
export function validateConfiguration(schema) {
  if (schema == null) return;
  assert.ok(object(schema,["version","groups","fields","migrations"]) && version(schema.version) &&
    Array.isArray(schema.groups) && schema.groups.length >= 1 && schema.groups.length <= 16 &&
    Array.isArray(schema.fields) && schema.fields.length >= 1 && schema.fields.length <= 64 && Buffer.byteLength(JSON.stringify(schema)) <= 65536,
    "Invalid plugin configuration declaration");
  const groups = new Set(),fields = new Set(),count = {nodes:0};
  for (const group of schema.groups) {
    assert.ok(object(group,["id","title"]) && key(group.id) && plain(group.title,120) && !groups.has(group.id),"Invalid configuration group");groups.add(group.id);
  }
  const defaults = Object.create(null);
  for (const field of schema.fields) {
    assert.ok(object(field,["id","group","title","description","schema","default"]) && key(field.id) && !fields.has(field.id) && groups.has(field.group) && plain(field.title,120) &&
      (field.description == null || plain(field.description,512)) && Object.hasOwn(field,"default"),"Invalid configuration field");
    fields.add(field.id);validateDefinition(field.schema,0,count);
    assert.ok(validValue(field.schema,field.default),`Invalid default for ${field.id}`);defaults[field.id]=field.default;
  }
  assert.ok(Buffer.byteLength(JSON.stringify(defaults)) <= 65536,"Configuration defaults exceed document limit");
  const migrations = schema.migrations === undefined ? [] : schema.migrations;
  assert.ok(Array.isArray(migrations) && migrations.length <= 32);
  const sources = new Set();
  for (const step of migrations) {
    const identity = `${step.fromVersion}:${step.fromDigest}`;
    assert.ok(object(step,["fromVersion","fromDigest","toVersion","toDigest","operations"]) && version(step.fromVersion) && version(step.toVersion) && step.toVersion > step.fromVersion && step.toVersion <= schema.version &&
      digest(step.fromDigest) && digest(step.toDigest) && !sources.has(identity) && Array.isArray(step.operations) && step.operations.length <= 128,"Invalid configuration migration");sources.add(identity);
    for (const op of step.operations) {
      assert.ok(op && typeof op === "object");
      if (op.op === "rename") assert.ok(object(op,["op","from","to"]) && key(op.from) && key(op.to) && op.from !== op.to);
      else if (op.op === "setDefault") assert.ok(object(op,["op","key","value"]) && key(op.key) && Object.hasOwn(op,"value") && Buffer.byteLength(JSON.stringify(op.value)) <= 65536);
      else { assert.equal(op.op,"remove");assert.ok(object(op,["op","key"]) && key(op.key)); }
    }
  }
}
