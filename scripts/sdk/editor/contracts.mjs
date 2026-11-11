import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Canonical public DTOs only; no store or private application dependencies. */
export async function syncEditorContracts(applicationDirectory, sdkDirectory, check) {
  const root = join(applicationDirectory, "src/lib/extensions/contracts/editor/data");
  const files = (await readdir(root)).filter(name => name.endsWith(".ts"));
  assert.ok(files.length > 0);
  for (const name of files) {
    const source = (await readFile(join(root, name), "utf8")).replaceAll("\r\n", "\n");
    for (const match of source.matchAll(/from "([^"]+)"/g))
      assert.match(match[1], /^\.\/[a-z]+\.js$/);
    assert.ok(!/@\/|\bnamespace\b/.test(source), `Private editor dependency: ${name}`);
    const expected = source.replace(/from "([^"]+)\.js"/g, 'from "$1.mjs"');
    const target = join(sdkDirectory, "rpc/editor/data", name.replace(/\.ts$/, ".d.mts"));
    if (check) assert.equal((await readFile(target, "utf8")).replaceAll("\r\n", "\n"), expected, `Editor contract differs: ${name}`);
    else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, expected); }
  }
}
