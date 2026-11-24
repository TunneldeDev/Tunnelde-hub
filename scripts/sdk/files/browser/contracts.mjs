import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Copy the independent canonical wire DTOs and schema, never React/store types. */
export async function syncFileBrowserContracts(applicationDirectory, sdkDirectory, check) {
  const root = join(applicationDirectory, "src/lib/extensions/contracts/files/browser");
  for (const name of (await readdir(root)).filter(name => name.endsWith(".ts"))) {
    const source = (await readFile(join(root, name), "utf8")).replaceAll("\r\n", "\n");
    assert.ok(!/@\/|\bnamespace\b|^\s*import\b/m.test(source), `Private browser dependency: ${name}`);
    await output(join(sdkDirectory, "rpc/files/browser", name.replace(/\.ts$/, ".d.mts")), source, check);
  }
  const schema = JSON.parse(await readFile(join(applicationDirectory, "src-tauri/src/plugins/api/domains/files/browser/schema.json"), "utf8"));
  await output(join(sdkDirectory, "files/browser/schema.json"), JSON.stringify(schema, null, 2) + "\n", check);
}
async function output(path, expected, check) {
  if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, `Browser contract differs: ${path}`);
  else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
}
