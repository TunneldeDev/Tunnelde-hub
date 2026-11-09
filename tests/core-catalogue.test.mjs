import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("event publication freezes host identity, optional payload and advisory delivery", async () => {
  const catalogue = JSON.parse(await readFile(new URL("../sdk/api.json", import.meta.url), "utf8"));
  const method = catalogue.methods.find(method => method.name === "events.publish");
  assert.equal(method.stability, "stable");
  assert.equal(method.since, "0.21.0");
  assert.deepEqual(method.permissions, []);
  assert.deepEqual(method.contract.inputSchema.required, ["event"]);
  assert.deepEqual(method.contract.events, ["plugin://event"]);
  assert.deepEqual(method.contract.eventSchema.required, ["pluginId", "generation", "event", "payload"]);
  assert.equal(method.contract.resultSchema.type, "null");
  assert.match(method.description, /not subscriber acknowledgement/);
});

test("tab-bar contracts include stable availability, replacement semantics and advisory command input", async () => {
  const catalogue = JSON.parse(await readFile(new URL("../sdk/api.json", import.meta.url), "utf8"));
  for (const name of ["tabBar.set", "tabBar.remove"]) {
    const method = catalogue.methods.find((method) => method.name === name);
    assert.equal(method.stability, "stable");
    assert.equal(method.since, "0.32.0-beta.6");
    assert.deepEqual(method.permissions, []);
    assert.equal(method.contract.version, 1);
    assert.deepEqual(method.contract.events, []);
    assert.equal(method.contract.inputSchema.additionalProperties, true);
    assert(method.contract.knownErrors.includes("pluginSecurity.permissionDenied"));
    assert.equal(method.contract.resultSchema.type, name === "tabBar.set" ? "null" : "boolean");
  }
  const contract = catalogue.methods.find((method) => method.name === "tabBar.set").contract;
  assert.match(contract.inputSchema.description, /Full replacement/);
  assert.deepEqual(contract.commandContextSchema.required, ["_locale", "_tabBar"]);
  const context = contract.commandContextSchema.properties._tabBar;
  assert.deepEqual(context.required, ["itemId", "tabId", "tabKind", "paneId", "value"]);
  assert.equal(context.additionalProperties, true);
  for (const privateField of ["token", "generation", "fingerprint", "permissions"])
    assert.equal(context.properties[privateField], undefined);
});

test("published catalogue carries versioned contracts for the stable core", async () => {
  const catalogue = JSON.parse(await readFile(new URL("../sdk/api.json", import.meta.url), "utf8"));
  for (const name of [
    "api.describe",
    "sessions.list",
    "storage.get",
    "storage.set",
    "storage.delete",
    "workspace.snapshot",
  ]) {
    const method = catalogue.methods.find((method) => method.name === name);
    assert.equal(method.stability, "stable", name);
    assert.equal(method.since, "0.21.0", name);
    const permissions = { "sessions.list": ["sessions.read"], "workspace.snapshot": ["workspace.read"] };
    assert.deepEqual(method.permissions, permissions[name] ?? []);
    assert.equal(method.contract.version, 1);
    for (const field of ["inputSchema", "resultSchema", "errorSchema"]) {
      assert.equal(
        method.contract[field].$schema,
        "http://json-schema.org/draft-07/schema#",
        `${name}.${field}`,
      );
    }
    assert.deepEqual(method.contract.events, []);
    assert(method.contract.knownErrors.includes("pluginSecurity.permissionDenied"));
  }
  for (const name of ["settings.get", "workspace.openPage", "runners.start"]) {
    const method = catalogue.methods.find((method) => method.name === name);
    assert.equal(method.stability, "experimental", name);
    assert.equal(method.contract, undefined, name);
  }
});

test("published editor contracts describe independent DTOs, errors and permissions", async () => {
  const catalogue = JSON.parse(await readFile(new URL("../sdk/api.json", import.meta.url), "utf8"));
  for (const [name, permission, fields] of [
    [
      "editor.active",
      "editor.read",
      ["tabId", "documentId", "version", "path", "name", "content", "dirty"],
    ],
    ["editor.replace", "editor.write", ["tabId", "documentId", "version", "dirty"]],
  ]) {
    const method = catalogue.methods.find((method) => method.name === name);
    assert.equal(method.stability, "stable");
    assert.equal(method.since, "0.29.0-beta.2");
    assert.deepEqual(method.permissions, [permission]);
    assert.equal(method.contract.version, 1);
    assert.deepEqual(method.contract.events, []);
    assert(method.contract.knownErrors.includes("pluginSecurity.permissionDenied"));
    const result =
      name === "editor.active"
        ? method.contract.resultSchema.anyOf.find((item) => item.type === "object")
        : method.contract.resultSchema;
    assert.deepEqual(result.required, fields);
    assert.equal(result.additionalProperties, true);
    for (const key of ["sessionId", "baseline", "loading", "error"])
      assert.equal(result.properties[key], undefined);
  }
});
