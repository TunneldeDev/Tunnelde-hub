import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";

export async function syncFileContentContracts(application, sdk, check) {
  const declarations = (await readFile(join(application, "src/lib/extensions/contracts/files/content.ts"), "utf8")).replaceAll("\r\n", "\n");
  assert(!/@\/|\bnamespace\b|^\s*import\b/m.test(declarations), "File content DTOs must be independent");
  const schema = JSON.parse(await readFile(join(application, "src-tauri/src/plugins/files/content/schema.json"), "utf8"));
  for (const [name, expected] of [["rpc/files/content.d.mts", declarations], ["files/content/schema.json", JSON.stringify(schema, null, 2) + "\n"]]) {
    const path = join(sdk, name);
    if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, "File content contract differs: " + name);
    else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
  }
}
