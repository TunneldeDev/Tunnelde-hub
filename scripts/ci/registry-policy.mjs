import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export function checkRegistryChanges(previous, next) {
  const entries = new Map(next.plugins.map((entry) => [entry.id, entry]));
  for (const entry of previous.plugins) {
    const updated = entries.get(entry.id);
    if (!updated) continue; // Removing an unsafe package is an intentional supported operation.
    if (updated.version === entry.version) {
      assert.equal(updated.sha256, entry.sha256, `${entry.id}: changed bytes require a new version`);
      assert.equal(updated.url, entry.url, `${entry.id}: an existing version must retain its download URL`);
    } else {
      const a = entry.version.split(".").map(Number);
      const b = updated.version.split(".").map(Number);
      const difference = b.findIndex((part, index) => part !== a[index]);
      assert.ok(difference >= 0 && b[difference] > a[difference], `${entry.id}: versions must increase`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.argv[2];
  assert.match(base ?? "", /^[a-f0-9]{40}$/, "Expected a base commit SHA");
  const previous = JSON.parse(execFileSync("git", ["show", `${base}:registry.json`], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 }));
  checkRegistryChanges(previous, JSON.parse(readFileSync("registry.json", "utf8")));
  console.log("Existing package versions retain immutable bytes and download URLs.");
}
