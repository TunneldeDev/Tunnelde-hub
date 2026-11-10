import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function syncRuntimeResourceContracts(application, sdk, check) {
  for (const name of ["resource", "snapshot", "release"]) {
    const source = (await readFile(join(application, "src/lib/extensions/contracts/runtime/lifecycle", name + ".ts"), "utf8")).replaceAll("\r\n", "\n");
    assert.ok(!/@\/|\bnamespace\b/.test(source));
    for (const match of source.matchAll(/from "([^"]+)"/g)) assert.match(match[1], /^\.\/[a-z]+\.js$/);
    const expected = source.replace(/from "([^"]+)\.js"/g, 'from "$1.mjs"');
    const directory = join(sdk, "rpc/runtime/resources/data"), path = join(directory, name + ".d.mts");
    if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, `Runtime resource contract differs: ${name}`);
    else { await mkdir(directory, { recursive: true }); await writeFile(path, expected); }
  }
}
