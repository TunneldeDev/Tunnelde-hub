import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseRustCatalogue(source, contracts) {
  const body = source.match(/pub const METHODS:[\s\S]*?=\s*&\[([\s\S]*?)\n\];/)?.[1];
  assert.ok(body, "Rust METHODS catalogue was not found");
  const entries = body.replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (token) =>
    token.startsWith('"') ? token : " ",
  );
  const literal = '"(?:\\\\.|[^"\\\\])*"';
  const pattern = new RegExp(
    `(?<![\\w])(stable_method|method)!\\(\\s*(${literal})\\s*,\\s*\\[([^\\]]*)\\]\\s*,\\s*(${literal})\\s*,\\s*(${literal})(?:\\s*,\\s*(${literal}))?\\s*\\)`,
    "g",
  );
  const methods = [...entries.matchAll(pattern)].map((entry) => {
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
  // Reject every unrecognized catalogue entry, not just malformed known macros.
  const remainder = entries
    .replace(pattern, "")
    .replace(/[\s,]/g, "");
  assert.equal(remainder, "", "Unparsed host method or unsupported catalogue entry");
  assert.ok(methods.length > 0, "Host catalogue is empty");
  assert.equal(
    new Set(methods.map(({ name }) => name)).size,
    methods.length,
    "Duplicate host method",
  );
  const expectsContracts = /include_str!\(\s*"contracts\/core-v1\.json"\s*\)/.test(source);
  assert.equal(expectsContracts, contracts !== undefined, "Host core contracts are missing or unexpected");
  if (expectsContracts) {
    assert.equal(contracts?.version, 1, "Unsupported core contract version");
    assert.ok(contracts.methods && typeof contracts.methods === "object" && !Array.isArray(contracts.methods), "Invalid core contract methods");
    for (const [name, contract] of Object.entries(contracts.methods)) {
      const method = methods.find((entry) => entry.name === name);
      assert.equal(method?.stability, "stable", `Contract for unknown or non-stable method: ${name}`);
      assert.equal(contract.version, 1, `Invalid contract version: ${name}`);
      for (const field of ["inputSchema", "resultSchema", "errorSchema"]) {
        assert.ok(contract[field] && typeof contract[field] === "object" && !Array.isArray(contract[field]), `Missing ${field}: ${name}`);
      }
      assert.ok(Array.isArray(contract.events) && Array.isArray(contract.knownErrors), `Missing event/error behavior: ${name}`);
      method.contract = contract;
    }
    for (const method of methods.filter((entry) => entry.stability === "stable"))
      assert.ok(method.contract, `Stable method has no core contract: ${method.name}`);
  }
  return { version: 1, methods };
}

/** Read exactly the schema file embedded by the selected host, never a cached SDK copy. */
export async function loadRustCatalogue(applicationDirectory) {
  const directory = join(resolve(applicationDirectory), "src-tauri/src/plugins");
  const source = await readFile(join(directory, "api.rs"), "utf8");
  const contracts = /include_str!\(\s*"contracts\/core-v1\.json"\s*\)/.test(source)
    ? JSON.parse(await readFile(join(directory, "contracts/core-v1.json"), "utf8"))
    : undefined;
  return parseRustCatalogue(source, contracts);
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

const workspaceBegin = "// BEGIN GENERATED WORKSPACE V1 TYPES";
const workspaceEnd = "// END GENERATED WORKSPACE V1 TYPES";

function workspaceTypes(source) {
  assert.equal(source.split(workspaceBegin).length, 2, "Missing or duplicate workspace DTO start marker");
  assert.equal(source.split(workspaceEnd).length, 2, "Missing or duplicate workspace DTO end marker");
  const start = source.indexOf(workspaceBegin);
  const end = source.indexOf(workspaceEnd);
  assert.ok(end > start, "Invalid workspace DTO marker order");
  return source.slice(start, end + workspaceEnd.length).replaceAll("\r\n", "\n");
}

/** Stable wire types come from the host projection, never its internal store. */
async function syncWorkspaceTypes(applicationDirectory, sdkSource, catalogue, check) {
  if (!catalogue.methods.some(({ name, stability }) => name === "workspace.snapshot" && stability === "stable"))
    return sdkSource;
  const host = await readFile(join(applicationDirectory, "src/lib/plugins/workspace.ts"), "utf8");
  const expected = workspaceTypes(host);
  assert.match(sdkSource, /"workspace\.snapshot":\s*\[\s*Record<string,\s*never>,\s*PluginWorkspaceSnapshot,?\s*\]/, "Stable workspace.snapshot must return PluginWorkspaceSnapshot");
  if (check) {
    assert.equal(workspaceTypes(sdkSource), expected, "Workspace DTOs differ from the selected host; run npm run sdk:sync");
    return sdkSource;
  }
  if (!sdkSource.includes(workspaceBegin) && !sdkSource.includes(workspaceEnd))
    return sdkSource.replace(/^export interface HostMethodMap \{/m, `${expected}\n\nexport interface HostMethodMap {`);
  const previous = workspaceTypes(sdkSource);
  return sdkSource.replaceAll("\r\n", "\n").replace(previous, expected);
}

export async function syncSdk(applicationDirectory, { check = false, sdkDirectory = join(root, "sdk") } = {}) {
  const source = resolve(applicationDirectory);
  const catalogue = await loadRustCatalogue(source);
  const typesPath = join(sdkDirectory, "tunnelde-plugin.d.mts");
  const types = await readFile(typesPath, "utf8");
  let projectedTypes = await syncWorkspaceTypes(source, types, catalogue, check);
  const { version } = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  const json = JSON.stringify(catalogue, null, 2) + "\n";
  const escape = (value) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
  const rows = catalogue.methods.map(
    (method) =>
      `| \`${method.name}\` | ${method.permissions.map((permission) => `\`${permission}\``).join(", ") || "Approved execution"} | \`${escape(method.params)}\` | \`${method.stability}\` | ${method.since ?? ""} | ${method.deprecated ?? ""} | ${escape(method.description)} |`,
  );
  const markdown = `# Host API v1\n\nGenerated from the host method catalogue for Tunnelde ${version}. All calls require an approved executable plugin, including calls without domain permissions. \`host.describe()\` reports the running version. Regenerate with \`npm run sdk:sync -- ../Tunnelde\`.\n\nStability is part of the compatibility contract: \`stable\` methods include their first host version in \`since\`; \`experimental\` methods may evolve; \`deprecated\` methods include migration guidance.\n\n| Method | Permissions | Parameters | Stability | Since | Deprecated | Behavior |\n| --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n`;
  const artifacts = [
    ["api.json", json],
    ["api.md", markdown],
  ];
  // Only advertise UI declarations when the chosen host implements the loader.
  // Older hosts remain valid synchronization targets and do not require this file.
  const extensionPath = join(source, "src-tauri/src/plugins/extensions.json");
  if (catalogue.methods.some(({ name }) => name === "extensions.describe")) {
    const directory = JSON.parse(await readFile(extensionPath, "utf8"));
    if (directory.frontend) {
      const uiTypes = (await readFile(join(source, "src/lib/extensions/uiSdkContract.ts"), "utf8")).replaceAll("\r\n", "\n");
      assert.match(uiTypes, /readonly version: "0\.1\.0"/, "Unexpected UI SDK contract version");
      assert.equal(directory.frontend.sdkVersion, "0.1.0", "UI SDK version differs from host discovery");
      assert.ok(!uiTypes.includes("@/") && !/from ["']\./.test(uiTypes), "UI contract exposes host-private types");
      if (directory.frontend.providers) {
        const providers = directory.frontend.providers;
        assert.equal(providers.manifest, "views[].provider");
        assert.deepEqual(providers.targets, ["hostList", "workbench"]);
        assert.equal(providers.selection, "explicit-user");
        assert.equal(providers.fallback, "built-in");
        assert.deepEqual(providers.slots, ["Workspace", "Navigation", "Inspector", "StatusBar"]);
        assert.equal(providers.requiredSlot, "Workspace");
        assert.equal(providers.limits.perPlugin, 8);
        for (const slot of providers.slots) assert.match(uiTypes, new RegExp(`${slot}: React.ComponentType`));
      }
      artifacts.push(["tunnelde-ui.d.mts", uiTypes]);
    }
  }
  if (catalogue.methods.some(({ name }) => name === "extensions.describe")) {
    const extensions = JSON.parse(
      await readFile(
        join(source, "src-tauri/src/plugins/extensions.json"),
        "utf8",
      ),
    );
    assert.equal(
      extensions.version,
      1,
      "Unsupported extension directory version",
    );
    assert.equal(
      extensions.stability,
      "experimental",
      "Extension directory stability changed",
    );
    const ids = new Set();
    for (const point of extensions.points) {
      assert.ok(!ids.has(point.id), `Duplicate extension point: ${point.id}`);
      ids.add(point.id);
      if (point.registration.manifest !== undefined) {
        if (point.id === "hosts.fields") {
          assert.equal(point.registration.manifest, "hostFields");
          assert.equal(point.ownership, "manifest");
          assert.equal(point.stability, "experimental");
          assert.equal(point.concurrency, "revision-and-schema-digest");
          for (const [key, permissions] of [["read",point.permissions],["replace",point.writePermissions]]) {
            const method = catalogue.methods.find(method => method.name === point.registration[key]);
            assert.ok(method, `Missing host field method: ${key}`);
            assert.deepEqual(method.permissions, permissions);
            assert.equal(method.stability, "experimental");
          }
          const begin = "// BEGIN GENERATED HOST FIELDS V1 TYPES", end = "// END GENERATED HOST FIELDS V1 TYPES";
          const block = (text) => {
            assert.equal(text.split(begin).length,2,"Missing or duplicate host fields DTO start");
            assert.equal(text.split(end).length,2,"Missing or duplicate host fields DTO end");
            assert.ok(text.indexOf(end) > text.indexOf(begin));
            return text.slice(text.indexOf(begin),text.indexOf(end)+end.length).replaceAll("\r\n","\n");
          };
          const expected = block(await readFile(join(source,"src/lib/hosts/fields.ts"),"utf8"));
          assert.ok(!expected.includes("@/") && !/\bimport\b/.test(expected),"Host fields DTO exposes private types");
          if (check) assert.equal(block(projectedTypes),expected,"Host fields DTOs differ; run npm run sdk:sync");
          else if (!projectedTypes.includes(begin) && !projectedTypes.includes(end)) projectedTypes = projectedTypes.replace(/^export interface HostMethodMap \{/m, `${expected}\n\nexport interface HostMethodMap {`);
          else projectedTypes = projectedTypes.replaceAll("\r\n","\n").replace(block(projectedTypes),expected);
          continue;
        }
        assert.equal(point.id, "hostList.menu", "Unknown manifest extension point");
        assert.equal(point.registration.manifest, "commands[].hostMenu");
        assert.deepEqual(Object.keys(point.registration), ["manifest"]);
        assert.equal(point.stability, "experimental");
        assert.equal(point.ownership, "manifest");
        assert.deepEqual(point.permissions, ["hosts.read"]);
        assert.deepEqual(point.limits, { perPlugin: 16, total: 128 });
        const begin = "// BEGIN GENERATED HOST MENU V1 TYPES";
        const end = "// END GENERATED HOST MENU V1 TYPES";
        const block = (text) => {
          assert.equal(text.split(begin).length, 2, "Missing or duplicate host menu DTO start");
          assert.equal(text.split(end).length, 2, "Missing or duplicate host menu DTO end");
          assert.ok(text.indexOf(end) > text.indexOf(begin), "Invalid host menu DTO order");
          return text.slice(text.indexOf(begin), text.indexOf(end) + end.length).replaceAll("\r\n", "\n");
        };
        const expected = block(await readFile(join(source, "src/lib/plugins/hostMenu.ts"), "utf8"));
        assert.ok(!expected.includes("@/") && !/\bimport\b/.test(expected), "Host menu DTO exposes private types");
        if (check) {
          assert.equal(block(projectedTypes), expected, "Host menu DTOs differ; run npm run sdk:sync");
        } else if (!projectedTypes.includes(begin) && !projectedTypes.includes(end)) {
          projectedTypes = projectedTypes.replace(/^export interface HostMethodMap \{/m, `${expected}\n\nexport interface HostMethodMap {`);
        } else {
          projectedTypes = projectedTypes.replaceAll("\r\n", "\n").replace(block(projectedTypes), expected);
        }
        continue;
      }
      for (const name of Object.values(point.registration)) {
        const method = catalogue.methods.find((method) => method.name === name);
        assert.ok(method, `Unknown registration method: ${name}`);
        assert.deepEqual(
          method.permissions,
          point.permissions,
          `Extension permissions differ: ${point.id}`,
        );
        assert.equal(
          method.stability,
          point.stability,
          `Extension stability differs: ${point.id}`,
        );
      }
    }
    artifacts.push([
      "extensions.json",
      JSON.stringify(extensions, null, 2) + "\n",
    ]);
  }
  for (const [name, expected] of artifacts) {
    const path = join(sdkDirectory, name);
    if (check) {
      assert.ok(
        (await readFile(path, "utf8")) === expected,
        `${name} differs from the selected host; run npm run sdk:sync`,
      );
    } else {
      await writeFile(path, expected);
    }
  }
  if (check) {
    checkMethodTypes(types, catalogue);
  } else if (projectedTypes !== types) {
    await writeFile(typesPath, projectedTypes);
  }
  return catalogue;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const catalogue = await syncSdk(resolve(root, args.find((arg) => arg !== "--check") ?? "../Tunnelde"), { check });
  console.log(`${check ? "Checked" : "Synchronized"} ${catalogue.methods.length} host API methods.`);
}
