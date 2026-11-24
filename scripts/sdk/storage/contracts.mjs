import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Mirror independent public KV data contracts; no host locations or keyring dependency. */
export async function syncStorageContracts(applicationDirectory, sdkDirectory, check) {
  const root = join(applicationDirectory, "src/lib/extensions/contracts/storage/pluginData");
  const files = (await readdir(root)).filter(name => name.endsWith(".ts"));
  assert.ok(files.length > 0);
  for (const name of files) {
    const source = (await readFile(join(root, name), "utf8")).replaceAll("\r\n", "\n");
    assert.ok(!/\bSettings\b|@\/|\bnamespace\b/.test(source), `Private storage dependency: ${name}`);
    for (const match of source.matchAll(/from "([^"]+)"/g)) assert.match(match[1], /^\.\/[a-z]+\.js$/);
    const expected = source.replace(/from "([^"]+)\.js"/g, 'from "$1.mjs"');
    const path = join(sdkDirectory, "rpc/storage/pluginData", name.replace(/\.ts$/, ".d.mts"));
    if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, `Storage contract differs: ${name}`);
    else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
  }
  const schema = JSON.parse(await readFile(join(applicationDirectory, "src-tauri/src/plugins/api/domains/storage/observation/schema.json"), "utf8"));
  const expected = JSON.stringify(schema, null, 2) + "\n";
  const path = join(sdkDirectory, "storage/schema.json");
  if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, "Storage schema differs");
  else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
}
