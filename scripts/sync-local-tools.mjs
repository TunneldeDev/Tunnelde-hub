import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
export const ids = [
  "text-checksum",
  "byte-units",
  "unix-permissions",
  "csv-to-json",
  "unicode-inspector",
];
const shared = await readFile(new URL("./local-tools/runtime.mjs", import.meta.url), "utf8");
for (const id of ids) {
  const url = new URL(`../plugins/${id}/runtime.mjs`, import.meta.url);
  if (process.argv.includes("--write")) await writeFile(url, shared);
  else
    assert.equal(
      await readFile(url, "utf8"),
      shared,
      `Run node scripts/sync-local-tools.mjs --write: ${id}`,
    );
}
