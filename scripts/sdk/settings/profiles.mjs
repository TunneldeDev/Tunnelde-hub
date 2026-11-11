import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Mirror independent public metadata contracts; no Settings or store dependency. */
export async function syncProfilesContracts(applicationDirectory, sdkDirectory, check) {
  const root = join(applicationDirectory, "src/lib/extensions/contracts/profiles/data");
  const files = (await readdir(root, { recursive: true })).filter(name => name.endsWith(".ts"));
  assert.ok(files.length > 0);
  for (const name of files) {
    const source = (await readFile(join(root, name), "utf8")).replaceAll("\r\n", "\n");
    assert.ok(!/\bSettings\b|@\/|\bnamespace\b/.test(source), `Private profile dependency: ${name}`);
    for (const match of source.matchAll(/from "([^"]+)"/g)) assert.match(match[1], /^(?:\.\/|\.\.\/)[a-z]+\.js$/);
    const expected = source.replace(/from "([^"]+)\.js"/g, 'from "$1.mjs"');
    const path = join(sdkDirectory, "rpc/settings/profiles", name.replace(/\.ts$/, ".d.mts"));
    if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, `Profile contract differs: ${name}`);
    else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
  }
  const schema = JSON.parse(await readFile(join(applicationDirectory, "src-tauri/src/settings_profiles/observation/schema.json"), "utf8"));
  const expected = JSON.stringify(schema, null, 2) + "\n";
  const path = join(sdkDirectory, "profiles/schema.json");
  if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, "Profile schema differs");
  else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
  if (files.some(name => name.replaceAll("\\", "/").startsWith("content/"))) {
    const content = JSON.parse(await readFile(join(applicationDirectory, "src-tauri/src/settings_profiles/content/schema.json"), "utf8"));
    const target = join(sdkDirectory, "profiles/content/schema.json");
    const text = JSON.stringify(content, null, 2) + "\n";
    if (check) assert.equal((await readFile(target, "utf8")).replaceAll("\r\n", "\n"), text, "Profile content schema differs");
    else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, text); }
    const limitsPath = join(sdkDirectory, "profiles/content/limits.mjs");
    const limits = "// Generated from the profile content schema; run sdk:sync to update.\n" +
      `export const MAX_CONTENT_BYTES = ${content.definitions.chunk.properties.totalBytes.maximum};\n` +
      `export const MAX_CHUNK_BYTES = ${content.definitions.readRequest.properties.limit.maximum};\n`;
    if (check) assert.equal((await readFile(limitsPath, "utf8")).replaceAll("\r\n", "\n"), limits, "Profile content limits differ");
    else await writeFile(limitsPath, limits);
  }
  if (files.some(name => name.replaceAll("\\", "/").startsWith("mutations/"))) {
    const schema = JSON.parse(await readFile(join(applicationDirectory, "src-tauri/src/settings_profiles/mutations/schema.json"), "utf8"));
    const target = join(sdkDirectory, "profiles/mutations/schema.json");
    const text = JSON.stringify(schema, null, 2) + "\n";
    if (check) assert.equal((await readFile(target, "utf8")).replaceAll("\r\n", "\n"), text, "Profile mutation schema differs");
    else { await mkdir(dirname(target), {recursive:true}); await writeFile(target,text); }
    const path = join(sdkDirectory, "profiles/mutations/limits.mjs");
    const limits = "// Generated from the profile mutation schema; run sdk:sync to update.\n" +
      `export const MAX_APPEND_BYTES = ${schema.definitions.append.properties.text["x-maxBytes"]};\n`;
    if (check) assert.equal((await readFile(path,"utf8")).replaceAll("\r\n","\n"), limits, "Profile mutation limits differ");
    else await writeFile(path,limits);
  }
}
