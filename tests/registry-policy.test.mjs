import test from "node:test";
import assert from "node:assert/strict";
import { checkRegistryChanges } from "../scripts/ci/registry-policy.mjs";

const entry = { id: "example", version: "1.2.3", sha256: "abc", url: "https://example.com/1.2.3.zip" };
const registry = (value) => ({ plugins: value ? [value] : [] });
test("catalogue tags may evolve without changing immutable package identity", () => {
  checkRegistryChanges(registry(entry), registry({ ...entry, tags: ["files"] }));
  checkRegistryChanges(registry(entry), registry(null));
});
test("existing versions cannot point to replacement bytes or URLs", () => {
  for (const update of [{ sha256: "def" }, { url: "https://example.com/latest.zip" }])
    assert.throws(() => checkRegistryChanges(registry(entry), registry({ ...entry, ...update })));
});
test("versions increase numerically, including multiple digits", () => {
  checkRegistryChanges(registry(entry), registry({ ...entry, version: "1.10.0", sha256: "new" }));
  for (const version of ["1.2.2", "1.1.99", "0.99.99"])
    assert.throws(() => checkRegistryChanges(registry(entry), registry({ ...entry, version })));
});
