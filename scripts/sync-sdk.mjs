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
    `(stable_method|method)!\\(\\s*(${literal})\\s*,\\s*\\[([^\\]]*)\\]\\s*,\\s*(${literal})\\s*,\\s*(${literal})(?:\\s*,\\s*(${literal}))?\\s*\\)`,
    "g",
  );
  const methods = [...body.matchAll(pattern)].map((entry) => {
    const stability = entry[1] === "stable_method" ? "stable" : "experimental";
    assert.equal(
      stability === "stable",
      Boolean(entry[6]),
      `${entry[2]}: stable methods must declare since`,
    );
    return {
      name: JSON.parse(entry[2]),
      permissions: JSON.parse(`[${entry[3]}]`),
      params: JSON.parse(entry[4]),
      description: JSON.parse(entry[5]),
      stability,
      since: entry[6] ? JSON.parse(entry[6]) : null,
      deprecated: null,
    };
  });
  assert.equal(
    methods.length,
    (body.match(/(?:stable_method|(?<!stable_)method)!\(/g) ?? []).length,
    "Unparsed host method",
  );
  assert.ok(methods.length > 0, "Host catalogue is empty");
  assert.equal(
    new Set(methods.map(({ name }) => name)).size,
    methods.length,
    "Duplicate host method",
  );
  return { version: 1, methods };
}

export function checkMethodTypes(source, catalogue) {
  const body = source.match(/^export interface HostMethodMap \{\s*$([\s\S]*?)^\}/m)?.[1];
  assert.ok(body, "SDK HostMethodMap was not found");
  const names = [];
  for (const line of body.split(/\r?\n/)) {
    if (!/^  \S/.test(line) || /^  \];\s*$/.test(line)) continue;
    const match = line.match(/^  (?:"([^"\r\n]+)"|([A-Za-z_$][\w$]*)):\s*\[/);
    assert.ok(match, `Unsupported HostMethodMap entry: ${line.trim()}`);
    names.push(match[1] ?? match[2]);
  }
  assert.equal(new Set(names).size, names.length, "Duplicate SDK method type");
  const actual = new Set(names);
  const expected = new Set(catalogue.methods.map(({ name }) => name));
  const missing = [...expected].filter((name) => !actual.has(name)).sort();
  const extra = [...actual].filter((name) => !expected.has(name)).sort();
  assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, "SDK method types differ from host catalogue");
}

export async function syncSdk(applicationDirectory, { check = false, sdkDirectory = join(root, "sdk") } = {}) {
  const source = resolve(applicationDirectory);
  const catalogue = parseRustCatalogue(
    await readFile(join(source, "src-tauri/src/plugins/api.rs"), "utf8"),
  );
  const { version } = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const json = JSON.stringify(catalogue, null, 2) + "\n";
  const escape = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const rows = catalogue.methods.map(
    (method) =>
      `| \`${method.name}\` | ${method.permissions.map((permission) => `\`${permission}\``).join(", ") || "Approved execution"} | \`${escape(method.params)}\` | \`${method.stability}\` | ${method.since ?? ""} | ${method.deprecated ?? ""} | ${escape(method.description)} |`,
  );
  const markdown = `# Host API v1\n\nGenerated from the host method catalogue for Tunnelde ${version}. All calls require an approved executable plugin, including calls without domain permissions. \`host.describe()\` reports the running version. Regenerate with \`npm run sdk:sync -- ../Tunnelde\`.\n\nStability is part of the compatibility contract: \`stable\` methods include their first host version in \`since\`; \`experimental\` methods may evolve; \`deprecated\` methods include migration guidance.\n\n| Method | Permissions | Parameters | Stability | Since | Deprecated | Behavior |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`;
  for (const [name, expected] of [["api.json", json], ["api.md", markdown]]) {
    const path = join(sdkDirectory, name);
    if (check) {
      assert.ok((await readFile(path, "utf8")) === expected, `${name} differs from the selected host; run npm run sdk:sync`);
    } else {
      await writeFile(path, expected);
    }
  }
  if (check) {
    checkMethodTypes(await readFile(join(sdkDirectory, "tunnelde-plugin.d.mts"), "utf8"), catalogue);
  }
  return catalogue;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const catalogue = await syncSdk(resolve(root, args.find((arg) => arg !== "--check") ?? "../Tunnelde"), { check });
  console.log(`${check ? "Checked" : "Synchronized"} ${catalogue.methods.length} host API methods.`);
}
