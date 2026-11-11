import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function syncLoggingContracts(
  applicationDirectory,
  sdkDirectory,
  check,
) {
  const root = join(
    applicationDirectory,
    "src/lib/extensions/contracts/logging",
  );
  for (const name of (await readdir(root)).filter((name) =>
    name.endsWith(".ts"),
  )) {
    const source = (await readFile(join(root, name), "utf8")).replaceAll(
      "\r\n",
      "\n",
    );
    assert.ok(!/@\/|\bnamespace\b|\bSettings\b/.test(source));
    for (const match of source.matchAll(/from "([^"]+)"/g))
      assert.match(match[1], /^\.\/[a-z]+\.js$/);
    const expected = source.replace(/from "([^"]+)\.js"/g, 'from "$1.mjs"');
    const path = join(
      sdkDirectory,
      "rpc/logging/data",
      name.replace(/\.ts$/, ".d.mts"),
    );
    if (check)
      assert.equal(
        (await readFile(path, "utf8")).replaceAll("\r\n", "\n"),
        expected,
        `Log contract differs: ${name}`,
      );
    else {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, expected);
    }
  }
  const schema = JSON.parse(
    await readFile(
      join(
        applicationDirectory,
        "src-tauri/src/plugins/api/domains/logging/schema.json",
      ),
      "utf8",
    ),
  );
  const expected = JSON.stringify(schema, null, 2) + "\n",
    path = join(sdkDirectory, "logging/schema.json");
  if (check)
    assert.equal(
      (await readFile(path, "utf8")).replaceAll("\r\n", "\n"),
      expected,
      "Log schema differs",
    );
  else {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
  }
}
