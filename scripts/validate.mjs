import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { packageOfficialPlugins } from "./plugins/package.mjs";
import { validateFileIconThemes, validateTags } from "./plugins/file-icons.mjs";

import { validateFilePreviews } from "./plugins/previews.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export function validateManifest(manifest, id) {
  validateTags(manifest.tags);
  validateFilePreviews(manifest.filePreviews);
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
    ["node", "wasm", "theme", "declarative", "frontend"].includes(manifest.runtime ?? "node"),
    `${id}: unknown runtime`,
  );
  assert.equal(
    manifest.readme,
    "README.md",
    `${id}: document installation and permissions in README.md`,
  );
  assert.ok(Array.isArray(manifest.permissions), `${id}: declare permissions explicitly`);
  const knownPermissions = new Set([
    "ui.trusted",
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
    "editor.read",
    "editor.write",
    "clipboard.read",
    "clipboard.write",
    "app.openExternal",
    "network",
    "process.exec",
    "secrets",
    "mounts.read",
    "mounts.write",
    "forwards.read",
    "forwards.write",
  ]);
  for (const permission of manifest.permissions)
    assert.ok(knownPermissions.has(permission), `${id}: unknown permission ${permission}`);
  if (manifest.frontend !== undefined) {
    const frontend = manifest.frontend;
    assert.ok(frontend && typeof frontend === "object" && !Array.isArray(frontend) &&
      Object.keys(frontend).every(key => ["entry", "sdk"].includes(key)) &&
      typeof frontend.entry === "string" && frontend.entry.length <= 240 &&
      /^ui\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.mjs$/.test(frontend.entry) &&
      frontend.entry.split('/').every(segment => segment !== '.' && segment !== '..') &&
      typeof frontend.sdk === "string" && frontend.sdk.trim() && frontend.sdk.length <= 160 &&
      manifest.runtime !== "theme" && manifest.permissions.includes("ui.trusted"),
      `${id}: invalid trusted frontend declaration`);
  }
  assert.ok(
    manifest.mountedFileReveal === undefined ||
      (typeof manifest.mountedFileReveal === "boolean" &&
        (!manifest.mountedFileReveal ||
          (manifest.runtime !== "theme" && manifest.permissions.includes("mounts.read") &&
            manifest.permissions.includes("mounts.write")))),
    `${id}: invalid mounted file reveal contribution or missing permissions`,
  );
  const commandIds = new Set();
  assert.ok(
    manifest.commands === undefined || Array.isArray(manifest.commands),
    `${id}: commands must be an array`,
  );
  for (const command of manifest.commands ?? []) {
    assert.ok(command.frontend === undefined ||
      (typeof command.frontend === "boolean" && (!command.frontend || manifest.frontend)),
      `${id}: frontend command requires a frontend declaration`);
    assert.ok(
      command &&
        typeof command.id === "string" &&
        command.id.length <= 128 &&
        command.id.split(".").every((part) => idPattern.test(part)) &&
        !commandIds.has(command.id),
      `${id}: invalid command id`,
    );
    commandIds.add(command.id);
    assert.ok(
      typeof command.title === "string" && command.title.trim(),
      `${id}: invalid command title`,
    );
    for (const field of ["keybindings", "macKeybindings"]) {
      const bindings = command[field];
      if (bindings === undefined) continue;
      assert.ok(Array.isArray(bindings) && bindings.length <= 4, `${id}: invalid ${field}`);
      for (const binding of bindings) {
        assert.equal(typeof binding, "string", `${id}: invalid shortcut`);
        const parts = binding.split("+"),
          key = parts.pop();
        const modifiers = new Set(parts);
        assert.ok(
          parts.every((part) => ["Mod", "Ctrl", "Meta", "Alt", "Shift"].includes(part)) &&
            modifiers.size === parts.length &&
            !(modifiers.has("Mod") && (modifiers.has("Ctrl") || modifiers.has("Meta"))) &&
            !(modifiers.has("Ctrl") && modifiers.has("Meta")) &&
            /^(?:[a-zA-Z0-9]|F(?:[1-9]|1\d|2[0-4])|Comma|Period|Backslash|Equal|Plus|Minus|Space|Escape|Tab|Enter|Backspace|Delete|Insert|Home|End|PageUp|PageDown|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/.test(
              key,
            ),
          `${id}: invalid shortcut ${binding}`,
        );
      }
    }
    if (command.editor !== undefined) {
      const editor = command.editor;
      assert.ok(
        editor &&
          Array.isArray(editor.extensions) &&
          editor.extensions.length > 0 &&
          editor.extensions.length <= 64 &&
          editor.extensions.every(
            (extension) => typeof extension === "string" && /^[a-z0-9._-]{1,64}$/i.test(extension),
          ) &&
          (editor.format === undefined || typeof editor.format === "boolean") &&
          Object.keys(editor).every((key) => ["extensions", "format"].includes(key)) &&
          manifest.permissions.includes("editor.read") &&
          manifest.permissions.includes("editor.write"),
        `${id}: invalid editor contribution or missing permissions`,
      );
    }
    if (command.fileMenu !== undefined) {
      const menu = command.fileMenu;
      const validList = (value, allowed) =>
        Array.isArray(value) && value.length > 0 && value.length <= allowed.length &&
        new Set(value).size === value.length && value.every((item) => allowed.includes(item));
      assert.ok(
        menu && typeof menu === "object" && !Array.isArray(menu) &&
          Object.keys(menu).every((key) => ["sources", "kinds", "extensions"].includes(key)) &&
          validList(menu.sources, ["local", "remote"]) &&
          validList(menu.kinds, ["file", "directory"]) &&
          (menu.extensions === undefined ||
            (Array.isArray(menu.extensions) && menu.extensions.length <= 64 &&
              menu.extensions.every((ext) => typeof ext === "string" && /^[a-z0-9._-]{1,64}(?![\s\S])/i.test(ext)))) &&
          (!menu.sources.includes("local") || manifest.permissions.includes("fs.read")) &&
          (!menu.sources.includes("remote") || manifest.permissions.includes("sftp.read")),
        `${id}: invalid file menu contribution or missing permissions`,
      );
    }
  }
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
      view.kind === undefined || ["chat", "blocks"].includes(view.kind) ||
        (view.kind === "component" && manifest.frontend),
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
      ((manifest.themes ?? []).length > 0 ||
        (manifest.fileIconThemes ?? []).length > 0 ||
        (manifest.filePreviews ?? []).length > 0) &&
        (manifest.themes ?? []).length <= 32,
      `${id}: missing themes`,
    );
  } else if (manifest.runtime === "frontend") {
    assert.ok(manifest.frontend && !manifest.main && !manifest.engines?.node &&
      (manifest.views ?? []).every(view => view.kind === "component"),
      `${id}: pure frontend packages require component views and no backend entry or Node dependency`);
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
    if (manifest.frontend) await readFile(join(directory, manifest.frontend.entry));
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
