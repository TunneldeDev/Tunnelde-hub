import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("published catalogue carries versioned contracts for the stable core", async () => {
  const catalogue = JSON.parse(
    await readFile(new URL("../sdk/api.json", import.meta.url), "utf8"),
  );
  for (const name of [
    "api.describe",
    "sessions.list",
    "storage.get",
    "storage.set",
    "storage.delete",
  ]) {
    const method = catalogue.methods.find((method) => method.name === name);
    assert.equal(method.stability, "stable", name);
    assert.equal(method.since, "0.21.0", name);
    assert.deepEqual(
      method.permissions,
      name === "sessions.list" ? ["sessions.read"] : [],
    );
    assert.equal(method.contract.version, 1);
    for (const field of ["inputSchema", "resultSchema", "errorSchema"]) {
      assert.equal(
        method.contract[field].$schema,
        "http://json-schema.org/draft-07/schema#",
        `${name}.${field}`,
      );
    }
    assert.deepEqual(method.contract.events, []);
    assert(
      method.contract.knownErrors.includes("pluginSecurity.permissionDenied"),
    );
  }
  for (const name of ["settings.get", "workspace.snapshot", "runners.start"]) {
    const method = catalogue.methods.find((method) => method.name === name);
    assert.equal(method.stability, "experimental", name);
    assert.equal(method.contract, undefined, name);
  }
});
