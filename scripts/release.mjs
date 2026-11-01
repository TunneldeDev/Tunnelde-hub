import assert from "node:assert/strict";
import { readFile, mkdir, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tag = process.argv[2];
assert.ok(
  /^plugins-v\d+\.\d+\.\d+$/.test(tag ?? ""),
  "Expected plugins-v<semver>",
);
const version = tag.slice("plugins-v".length);
const root = resolve("artifacts/plugins");
const { plugins } = JSON.parse(await readFile(`${root}/index.json`, "utf8"));
const matching = plugins.filter((entry) => entry.version === version);
assert.ok(matching.length > 0, "No package declares the tagged version");
await mkdir("artifacts/release", { recursive: true });
for (const entry of matching)
  await copyFile(
    `${root}/${entry.archive}`,
    `artifacts/release/${entry.archive}`,
  );
await writeFile(
  "artifacts/release/SHA256SUMS",
  matching.map((entry) => `${entry.sha256}  ${entry.archive}`).join("\n") +
    "\n",
);
await writeFile(
  "artifacts/release/index.json",
  JSON.stringify({ plugins: matching }, null, 2) + "\n",
);
await copyFile("registry.json", "artifacts/release/registry.json");
