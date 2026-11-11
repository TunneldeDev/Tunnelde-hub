//! Mirror only independent public contracts; private application types cannot leak.
import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function syncPreferencesContracts(applicationDirectory, sdkDirectory, check) {
  const root = join(applicationDirectory, "src/lib/extensions/contracts/preferences/data");
  const files = (await readdir(root, { recursive: true })).filter(name => name.endsWith(".ts"));
  assert.ok(files.length > 0);
  for (const name of files) {
    const source = (await readFile(join(root, name), "utf8")).replaceAll("\r\n", "\n");
    assert.ok(!/\bSettings\b|@\/|\bnamespace\b/.test(source), `Private preference type dependency: ${name}`);
    for (const match of source.matchAll(/from "([^"]+)"/g))
      assert.match(match[1], /^\.\/(?:groups\/)?[a-z]+\.js$/);
    const expected = source.replace(/from "([^"]+)\.js"/g, 'from "$1.mjs"');
    const path = join(sdkDirectory, "rpc/settings/preferences", name.replace(/\.ts$/, ".d.mts"));
    if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, `Preference contract differs: ${name}`);
    else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
  }
  const mapping = await readFile(join(applicationDirectory, "src-tauri/src/services/settings/preferences/mapping/mod.rs"), "utf8");
  const groups = {};
  for (const match of mapping.matchAll(/id:\s*"([a-z]+)"/g)) {
    const name = match[1];
    groups[name] = JSON.parse(await readFile(join(applicationDirectory, "src-tauri/src/services/settings/preferences/schema", `${name}.json`), "utf8"));
  }
  const expected = JSON.stringify({ version: 1, stability: "experimental", groups }, null, 2) + "\n";
  const path = join(sdkDirectory, "preferences/schema.json");
  if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, "Preference schemas differ");
  else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
  // Trusted UI must also run on older supported WebViews without JSON module
  // import attributes. Generate executable data from the exact same schemas.
  const runtimePath = join(sdkDirectory, "preferences/schema.mjs");
  const runtime = "// Generated public preference schemas; run sdk:sync to update.\nexport default " + expected.trimEnd() + ";\n";
  if (check) assert.equal((await readFile(runtimePath, "utf8")).replaceAll("\r\n", "\n"), runtime, "Preference runtime schemas differ");
  else await writeFile(runtimePath, runtime);
}
