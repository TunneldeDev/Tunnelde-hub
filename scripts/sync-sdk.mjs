import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseRustCatalogue(source) {
  const body = source.match(/pub const METHODS:[\s\S]*?=\s*&\[([\s\S]*?)\n\];/)?.[1];
  assert.ok(body, "Rust METHODS catalogue was not found");
  const literal = '"(?:\\\\.|[^"\\\\])*"';
  const pattern = new RegExp(
    `method!\\(\\s*(${literal})\\s*,\\s*\\[([^\\]]*)\\]\\s*,\\s*(${literal})\\s*,\\s*(${literal})\\s*\\)`,
    "g",
  );
  const methods = [...body.matchAll(pattern)].map((entry) => ({
    name: JSON.parse(entry[1]),
    permissions: JSON.parse(`[${entry[2]}]`),
    params: JSON.parse(entry[3]),
    description: JSON.parse(entry[4]),
  }));
  assert.equal(methods.length, (body.match(/method!\(/g) ?? []).length, "Unparsed host method");
  assert.ok(methods.length > 0, "Host catalogue is empty");
  assert.equal(
    new Set(methods.map(({ name }) => name)).size,
    methods.length,
    "Duplicate host method",
  );
  return { version: 1, methods };
}

export async function syncSdk(applicationDirectory) {
  const source = resolve(applicationDirectory);
  const catalogue = parseRustCatalogue(
    await readFile(join(source, "src-tauri/src/plugins/api.rs"), "utf8"),
  );
  const { version } = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  await writeFile(join(root, "sdk/api.json"), JSON.stringify(catalogue, null, 2) + "\n");
  const escape = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const rows = catalogue.methods.map(
    (method) =>
      `| \`${method.name}\` | ${method.permissions.map((permission) => `\`${permission}\``).join(", ") || "Approved execution"} | \`${escape(method.params)}\` | ${escape(method.description)} |`,
  );
  await writeFile(
    join(root, "sdk/api.md"),
    `# Host API v1\n\nGenerated from the host method catalogue for Tunnelde ${version}. All calls require an approved executable plugin, including calls without domain permissions. \`host.describe()\` reports the running version. Regenerate with \`npm run sdk:sync -- ../Tunnelde\`.\n\n| Method | Permissions | Parameters | Behavior |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`,
  );
  return catalogue;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalogue = await syncSdk(resolve(root, process.argv[2] ?? "../Tunnelde"));
  console.log(`Synchronized ${catalogue.methods.length} host API methods.`);
}
