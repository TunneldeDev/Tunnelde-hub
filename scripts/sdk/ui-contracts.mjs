import assert from "node:assert/strict";
import { lstat, readdir, readFile } from "node:fs/promises";
import { join, posix } from "node:path";

const entry = "uiSdkContract.ts";
const dependency = /\b(?:import\s+type\s+(?:\*\s+as\s+\w+|\{[\w\s,]+\})|export\s+type\s+(?:\*|\{[\w\s,]+\}))\s+from\s+("[^"\r\n]+"|'[^'\r\n]+')\s*;/g;
const tokens = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g;

function withoutComments(source) {
  return source.replace(tokens, token => token.startsWith("/") ? token.replace(/[^\r\n]/g, " ") : token);
}

/** Deliberately narrow public import grammar. New forms require explicit review. */
export function contractDependencies(source, name) {
  const text = withoutComments(source);
  const matches = [...text.matchAll(dependency)];
  const remainder = text.replace(dependency, "").replace(tokens, " ");
  assert.ok(!/\b(?:import|require)\b|export\s+(?:type\s+)?(?:\*|\{)/.test(remainder), `${name}: unsupported public type import/export`);
  assert.ok(!/\b(?:declare\s+module|namespace|function|class|const|let|var)\b|`/.test(remainder), `${name}: public contracts must contain types only`);
  return matches.map(match => ({ specifier: match[1].slice(1, -1), statement: match[0], index: match.index }));
}

async function walk(directory, prefix = "") {
  let entries;
  try {
    assert.ok((await lstat(directory)).isDirectory(), `Public contract directory must not be a symlink: ${directory}`);
    entries = await readdir(directory, { withFileTypes: true });
  }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const files = [];
  for (const item of entries.sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    assert.ok(!item.isSymbolicLink(), `Public contract symlink is forbidden: ${item.name}`);
    const name = prefix + item.name;
    if (item.isDirectory()) files.push(...await walk(join(directory, item.name), name + "/"));
    else {
      assert.ok(item.isFile(), `Unexpected public contract entry: ${name}`);
      files.push(name);
    }
  }
  return files;
}

function sdkName(name) {
  return name === entry ? "tunnelde-ui.d.mts" : name.replace(/^contracts\//, "ui/").replace(/\.ts$/, ".d.mts");
}

/** Follow only public type edges; every file in the public subtree must be reachable. */
export async function loadUiContracts(applicationDirectory) {
  const root = join(applicationDirectory, "src/lib/extensions");
  const sources = new Map(), edges = new Map(), active = new Set();
  async function visit(name) {
    assert.ok(!active.has(name), `Public contract dependency cycle: ${name}`);
    if (sources.has(name)) return;
    assert.ok((await lstat(join(root, name))).isFile(), `Public contract is not a regular file: ${name}`);
    const source = (await readFile(join(root, name), "utf8")).replaceAll("\r\n", "\n");
    sources.set(name, source); active.add(name);
    const imports = contractDependencies(source, name), dependencies = [];
    for (const { specifier } of imports) {
      if (specifier === "react") { dependencies.push(specifier); continue; }
      assert.ok(specifier.startsWith(".") && specifier.endsWith(".js") && !specifier.includes("\\"), `${name}: UI contract exposes host-private types: ${specifier}`);
      const target = posix.normalize(posix.join(posix.dirname(name), specifier)).replace(/\.js$/, ".ts");
      assert.match(target, /^contracts\/(?:[a-zA-Z][\w-]*\/)+[a-zA-Z][\w-]*\.ts$/, `${name}: UI contract exposes host-private types: ${specifier}`);
      dependencies.push(sdkName(target));
      await visit(target);
    }
    edges.set(sdkName(name), [...new Set(dependencies)].sort());
    active.delete(name);
  }
  // Inspect the whole subtree first, including parents of subsequently visited files.
  const files = await walk(join(root, "contracts"));
  assert.ok(files.every(name => name.endsWith(".ts")), "Public contract subtree contains non-TypeScript files");
  await visit(entry);
  assert.deepEqual([...sources.keys()].filter(name => name !== entry).sort(), files.map(name => "contracts/" + name).sort(), "Public contracts contain unreachable files");
  const artifacts = [...sources].map(([name, source]) => {
    let mirrored = source;
    for (const { statement, specifier, index } of contractDependencies(source, name).reverse()) {
      if (specifier === "react") continue;
      const target = posix.normalize(posix.join(posix.dirname(name), specifier)).replace(/\.js$/, ".ts");
      let mapped = posix.relative(posix.dirname(sdkName(name)), sdkName(target)).replace(/\.d\.mts$/, ".mjs");
      if (!mapped.startsWith(".")) mapped = "./" + mapped;
      mirrored = mirrored.slice(0, index) + statement.replace(specifier, mapped) + mirrored.slice(index + statement.length);
    }
    return [sdkName(name), mirrored];
  }).sort(([a], [b]) => a.localeCompare(b, "en"));
  const manifest = { version: 1, entry: "tunnelde-ui.d.mts", dependencies: Object.fromEntries([...edges].sort(([a], [b]) => a.localeCompare(b, "en"))) };
  artifacts.push(["ui-contracts.json", JSON.stringify(manifest, null, 2) + "\n"]);
  return { artifacts, declarations: [...sources.values()].join("\n") };
}

/** Check the entire generated subtree, including abandoned files, before any write. */
export async function checkUiContractFiles(sdkDirectory, artifacts) {
  const expected = artifacts.map(([name]) => name).filter(name => name.startsWith("ui/")).sort();
  const actual = (await walk(join(sdkDirectory, "ui"))).map(name => "ui/" + name).sort();
  assert.deepEqual(actual.filter(name => !expected.includes(name)), [], "Obsolete UI SDK files; review and remove retired declarations");
}
