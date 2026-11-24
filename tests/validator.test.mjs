import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateManifest, validateRegistry } from "../scripts/validate.mjs";
import { OFFICIAL_PLUGIN_IDS } from "../scripts/plugins/package.mjs";

const valid = JSON.parse(
  await readFile(new URL("../plugins/studio-themes/tunnelde-plugin.json", import.meta.url)),
);
test("registry stays reproducible and versioned assets live in the hub", async () => {
  const { plugins } = await validateRegistry();
  assert.equal(plugins.length, OFFICIAL_PLUGIN_IDS.length);
  for (const entry of plugins) {
    assert.equal(new URL(entry.url).host, "github.com");
    assert.ok(
      new URL(entry.url).pathname.startsWith(
        "/TunneldeDev/tunnelde-hub/releases/download/plugins-v",
      ),
    );
  }
});
test("validator rejects injected manifest defects", () => {
  for (const mutate of [
    (m) => {
      m.id = "../escape";
    },
    (m) => {
      m.version = "latest";
    },
    (m) => {
      m.apiVersion = 999;
    },
    (m) => {
      m.runtime = "powershell";
    },
    (m) => {
      m.readme = "../secret";
    },
    (m) => {
      m.permissions = ["root"];
    },
    (m) => {
      m.main = "index.js";
    },
    (m) => {
      m.themes = [];
    },
    (m) => {
      m.themes[0].colors.sidebar = "url(https://example.com)";
    },
    (m) => {
      m.themes.push(structuredClone(m.themes[0]));
    },
    (m) => {
      m.themes[0].appearance = "system";
    },
    (m) => {
      m.name = "";
    },
  ]) {
    const bad = structuredClone(valid);
    mutate(bad);
    assert.throws(() => validateManifest(bad, valid.id));
  }
});

test("validator supports explicitly permissioned chat sidebars and rejects malformed contributions", () => {
  const manifest = {
    id: "agent",
    name: "Agent",
    description: "Test controlled chat",
    author: "Test",
    version: "1.0.0",
    apiVersion: 1,
    runtime: "node",
    main: "index.mjs",
    readme: "README.md",
    permissions: ["process.exec", "secrets"],
    views: [{ id: "chat", title: "Assistant", location: "sidebar", kind: "chat", icon: "bot" }],
  };
  assert.equal(validateManifest(manifest, "agent"), manifest);
  for (const patch of [
    { location: "floating" },
    { kind: "html" },
    { icon: "unknown" },
    { title: "" },
  ]) {
    const bad = structuredClone(manifest);
    Object.assign(bad.views[0], patch);
    assert.throws(() => validateManifest(bad, "agent"));
  }
  const duplicate = structuredClone(manifest);
  duplicate.views.push({ ...duplicate.views[0] });
  assert.throws(() => validateManifest(duplicate, "agent"), /duplicate/);
  const duplicateGrant = structuredClone(manifest);
  duplicateGrant.permissions.push("secrets");
  assert.throws(() => validateManifest(duplicateGrant, "agent"), /duplicate permission/);
});

test("file menu contributions require valid filters and matching source permissions", () => {
  const manifest = {
    id: "file-actions", name: "File Actions", description: "File actions", author: "Test",
    version: "1.0.0", apiVersion: 1, runtime: "node", main: "index.mjs", readme: "README.md",
    permissions: ["fs.read", "sftp.read"],
    commands: [{ id: "inspect", title: "Inspect", fileMenu: {
      sources: ["local", "remote"], kinds: ["file", "directory"], extensions: ["json", "tar.gz"],
    } }],
  };
  assert.equal(validateManifest(manifest, manifest.id), manifest);
  for (const mutate of [
    (m) => { m.permissions = ["fs.read"]; },
    (m) => { m.permissions = ["sftp.read"]; },
    (m) => { m.commands[0].fileMenu.sources = []; },
    (m) => { m.commands[0].fileMenu.sources = ["local", "local"]; },
    (m) => { m.commands[0].fileMenu.kinds = ["symlink"]; },
    (m) => { m.commands[0].fileMenu.kinds = ["file", "file"]; },
    (m) => { m.commands[0].fileMenu.extensions = ["../json"]; },
    (m) => { m.commands[0].fileMenu.extensions = ["json\n"]; },
    (m) => { m.commands[0].fileMenu.extensions = Array(65).fill("json"); },
    (m) => { m.commands[0].fileMenu.extra = true; },
  ]) {
    const invalid = structuredClone(manifest);
    mutate(invalid);
    assert.throws(() => validateManifest(invalid, invalid.id), /file menu/);
  }
});

test("mounted file reveal requires both mount permissions and an executable or declarative runtime", () => {
  const manifest = {
    id: "mount-tool", name: "Mount tool", description: "Mount files", author: "Test",
    version: "1.0.0", apiVersion: 1, runtime: "declarative", main: "views.json", readme: "README.md",
    permissions: ["mounts.read", "mounts.write"], views: [{ id: "main", title: "Mounts" }], mountedFileReveal: true,
  };
  assert.equal(validateManifest(manifest, manifest.id), manifest);
  for (const permissions of [[], ["mounts.read"], ["mounts.write"]]) {
    assert.throws(() => validateManifest({ ...manifest, permissions }, manifest.id), /mounted file reveal/);
  }
  assert.throws(() => validateManifest({ ...manifest, mountedFileReveal: "yes" }, manifest.id), /mounted file reveal/);
});
