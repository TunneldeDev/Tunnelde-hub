import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** Wire DTOs are independent from React and application implementation details. */
export async function syncFilePreviewContracts(applicationDirectory, sdkDirectory, check) {
  const root = join(applicationDirectory, "src/lib/extensions/contracts/files/preview");
  for (const name of ["data", "actions"]) {
    const source = (await readFile(join(root, `${name}.ts`), "utf8")).replaceAll("\r\n", "\n");
    assert.ok(!/@\/|\bnamespace\b|^\s*import(?! type \{ FilePreviewSource \} from "\.\/data\.js";)/m.test(source), `Private preview dependency: ${name}`);
    await output(join(sdkDirectory, `rpc/files/preview/${name}.d.mts`), source.replaceAll('"./data.js"', '"./data.mjs"'), check);
  }
  const schema = JSON.parse(await readFile(join(applicationDirectory, "src-tauri/src/plugins/api/domains/files/preview/schema.json"), "utf8"));
  await output(join(sdkDirectory, "files/preview/schema.json"), JSON.stringify(schema, null, 2) + "\n", check);
}
async function output(path, expected, check) {
  if (check) assert.equal((await readFile(path, "utf8")).replaceAll("\r\n", "\n"), expected, `Preview contract differs: ${path}`);
  else { await mkdir(dirname(path), { recursive: true }); await writeFile(path, expected); }
}
