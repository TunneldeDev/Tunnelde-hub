import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { packageOfficialPlugins } from "./plugins/package.mjs";
import { validateFileIconThemes, validateTags } from "./plugins/file-icons.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export function validateManifest(manifest, id) {
  validateTags(manifest.tags);
  validateFileIconThemes(manifest.fileIconThemes);
  assert.ok(idPattern.test(id) && manifest.id === id, `Invalid plugin id: ${id}`);
  for (const key of ["name", "description", "author"])
    assert.ok(
      typeof manifest[key] === "string" &&
        manifest[key].trim().length > 0 &&
        !/[\r\n]/.test(manifest[key]),
      `${id}: ${key} is required`,
    );
  assert.ok(/^\d+\.\d+\.\d+$/.test(manifest.version), `${id}: use a semantic version`);
  assert.equal(manifest.apiVersion, 1, `${id}: unsupported API`);
  assert.ok(
    ["node", "wasm", "theme", "declarative"].includes(manifest.runtime ?? "node"),
    `${id}: unknown runtime`,
  );
  assert.equal(
    manifest.readme,
    "README.md",
    `${id}: document installation and permissions in README.md`,
  );
  assert.ok(Array.isArray(manifest.permissions), `${id}: declare permissions explicitly`);
  const knownPermissions = new Set([
    "log",
    "app.read",
    "settings.read",
    "settings.write",
    "hosts.read",
    "hosts.write",
    "sessions.read",
    "ssh.exec",
    "fs.read",
    "fs.write",
    "sftp.read",
    "sftp.write",
    "monitor.read",
    "monitor.write",
    "history.read",
    "history.write",
    "workspace.read",
    "workspace.write",
    "clipboard.read",
    "clipboard.write",
    "app.openExternal",
    "network",
    "process.exec",
    "secrets",
    "mounts.read",
    "mounts.write",
  ]);
  for (const permission of manifest.permissions)
    assert.ok(knownPermissions.has(permission), `${id}: unknown permission ${permission}`);
  assert.equal(
    new Set(manifest.permissions).size,
    manifest.permissions.length,
    `${id}: duplicate permission`,
  );
  const viewIds = new Set();
  assert.ok(
    manifest.views === undefined || Array.isArray(manifest.views),
    `${id}: views must be an array`,
  );
  for (const view of manifest.views ?? []) {
    assert.ok(
      view && idPattern.test(view.id) && !viewIds.has(view.id),
      `${id}: duplicate or invalid view id`,
    );
    viewIds.add(view.id);
    assert.ok(
      typeof view.title === "string" && view.title.trim() && view.title.length <= 120,
      `${id}: invalid view title`,
    );
    assert.ok(
      view.location === undefined || ["sidebar", "workspace"].includes(view.location),
      `${id}: invalid view location`,
    );
    assert.ok(
      view.kind === undefined || ["chat", "blocks"].includes(view.kind),
      `${id}: invalid view kind`,
    );
    assert.ok(
      view.icon === undefined ||
        [
          "bot",
          "message-square",
          "sparkles",
          "blocks",
          "network",
          "wrench",
          "message-circle",
          "plug",
          "terminal",
          "server",
          "folder",
          "shield",
        ].includes(view.icon),
      `${id}: invalid view icon`,
    );
  }
  if (manifest.runtime === "theme") {
    assert.ok(
      !manifest.main &&
        !manifest.commands?.length &&
        !manifest.views?.length &&
        !manifest.permissions.length,
      `${id}: themes cannot execute code`,
    );
    assert.ok(
      ((manifest.themes ?? []).length > 0 || (manifest.fileIconThemes ?? []).length > 0) && (manifest.themes ?? []).length <= 32,
      `${id}: missing themes`,
    );
  } else {
    assert.ok(
      typeof manifest.main === "string" &&
        !manifest.main.includes("..") &&
        !/^[\\/]|:/.test(manifest.main),
      `${id}: unsafe entry point`,
    );
    if (manifest.runtime === "declarative") {
      assert.ok(manifest.views?.length && !manifest.commands?.length && !manifest.engines?.node,
        `${id}: declarative packages need views, no executable commands and no Node dependency`);
    }
  }
  const colors = new Set([
    "background",
    "activityBar",
    "sidebar",
    "titleBar",
    "tabBar",
    "editor",
    "panel",
    "statusBar",
    "terminalBackground",
    "terminalForeground",
    "terminalCursor",
  ]);
  const ids = new Set();
  for (const theme of manifest.themes ?? []) {
    assert.ok(
      idPattern.test(theme.id) && !ids.has(theme.id),
      `${id}: duplicate or invalid theme id`,
    );
    ids.add(theme.id);
    assert.ok(
      typeof theme.name === "string" && theme.name.trim() && theme.name.length <= 120,
      `${id}: invalid theme name`,
    );
    assert.ok(["light", "dark"].includes(theme.appearance), `${id}: invalid appearance`);
    assert.ok(
      theme.accent === undefined || /^#[\da-f]{6}$/i.test(theme.accent),
      `${id}: invalid accent`,
    );
    assert.ok(theme.colors && Object.keys(theme.colors).length > 0, `${id}: empty palette`);
    for (const [key, value] of Object.entries(theme.colors))
      assert.ok(colors.has(key) && /^#[\da-f]{6}$/i.test(value), `${id}: invalid color ${key}`);
  }
  return manifest;
}

export async function validateRegistry({ write = false } = {}) {
  const directories = await readdir(join(root, "plugins"), {
    withFileTypes: true,
  });
  for (const entry of directories) {
    if (!entry.isDirectory() || entry.name === "tests") continue;
    const directory = join(root, "plugins", entry.name);
    const manifest = validateManifest(
      JSON.parse(await readFile(join(directory, "tunnelde-plugin.json"), "utf8")),
      entry.name,
    );
    const readme = await readFile(join(directory, "README.md"), "utf8");
    assert.ok(readme.trim().length >= 80, `${entry.name}: README must explain the plugin`);
    if (manifest.main) await readFile(join(directory, manifest.main));
  }
  const output = await mkdtemp(join(tmpdir(), "tunnelde-registry-"));
  try {
    await packageOfficialPlugins(output);
    const catalogue = JSON.parse(await readFile(join(output, "marketplace.json"), "utf8"));
    const text = JSON.stringify({ version: 1, ...catalogue }, null, 2) + "\n";
    const path = join(root, "registry.json");
    if (write) await writeFile(path, text);
    else
      assert.equal(
        await readFile(path, "utf8"),
        text,
        "registry.json drifted: run npm run registry and review the diff",
      );
    return catalogue;
  } finally {
    await rm(output, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registry = await validateRegistry({
    write: process.argv.includes("--write"),
  });
  console.log(
    `Validated ${registry.plugins.length} plugins and their deterministic package checksums.`,
  );
}
