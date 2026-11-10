import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateManifest } from "../scripts/validate.mjs";
import { syncSdk, checkProviderTypes } from "../scripts/sync-sdk.mjs";
import { loadRpcDeclarations } from "../scripts/sdk/rpc/declarations.mjs";
import { fileURLToPath } from "node:url";

test("both RPC and manifest provider target types must match the discovery catalogue", async () => {
  const { source: types } = await loadRpcDeclarations(fileURLToPath(new URL("../sdk", import.meta.url)));
  const directory = JSON.parse(await readFile(new URL("../sdk/extensions.json", import.meta.url), "utf8"));
  checkProviderTypes(types, directory.frontend.providers.targets);
  assert.throws(() => checkProviderTypes(types.replaceAll(' | "terminal"', ''), directory.frontend.providers.targets), /targets differ/);
  assert.throws(() => checkProviderTypes(types.replace(/provider\?:[^;]+;/, 'provider?: "workbench";'), directory.frontend.providers.targets), /targets differ/);
});

const manifest = {
  id: "custom-ui", name: "Custom UI", description: "Trusted frontend", author: "Example",
  version: "1.0.0", apiVersion: 1, runtime: "frontend", readme: "README.md",
  frontend: { entry: "ui/index.mjs", sdk: "^0.1.0" }, permissions: ["ui.trusted"],
  commands: [{ id: "hello", title: "Hello" }], views: [{ id: "main", title: "Main", kind: "component" }],
};

test("the public example validates and imports without a private host or second React", async () => {
  const sample = JSON.parse(await readFile(new URL("../examples/trusted-ui/tunnelde-plugin.json", import.meta.url), "utf8"));
  validateManifest(sample, sample.id);
  const { activate } = await import("../examples/trusted-ui/ui/index.mjs");
  const views = new Map(), commands = new Map();
  activate({ sdk: { react: {}, components: {} }, views: { register: (id, view) => views.set(id, view) }, commands: { register: (id, handler) => commands.set(id, handler) } });
  assert.equal(typeof views.get("main"), "function");
  assert.deepEqual(commands.get("hello")(), { text: "Hello from the shared UI runtime" });
});

test("pure and combined frontends require explicit trust and safe manifest declarations", () => {
  validateManifest(manifest, manifest.id);
  validateManifest({ ...manifest, runtime: "node", main: "backend.mjs", commands: [{ ...manifest.commands[0], frontend: true }] }, manifest.id);
  for (const mutate of [
    m => { m.permissions = []; },
    m => { m.frontend.entry = "ui/../backend.mjs"; },
    m => { m.frontend.entry = "https://example.org/code.mjs"; },
    m => { m.frontend.entry = "ui//index.mjs"; },
    m => { m.frontend.entry = "ui/index.js"; },
    m => { m.frontend.entry = "ui/./index.mjs"; },
    m => { m.frontend.sdk = 1; },
    m => { m.frontend.extra = true; },
    m => { m.engines = { node: ">=22" }; },
    m => { m.main = "backend.mjs"; },
    m => { m.views[0].kind = "blocks"; },
    m => { m.frontend = undefined; m.commands[0].frontend = true; },
  ]) {
    const bad = structuredClone(manifest); mutate(bad);
    assert.throws(() => validateManifest(bad, bad.id));
  }
});

test("interface providers require a trusted component declaration and explicit target metadata", () => {
  for (const provider of ["workbench", "hostList", "fileBrowser", "terminal", "history", "forwarding", "monitor", "backgroundTasks", "processes", "quickAccess"]) {
    const valid = { ...structuredClone(manifest), permissions: ["ui.trusted", "hosts.read", "fs.read", "sftp.read", "workspace.write", "workspace.read", "editor.read", "sessions.read", "ssh.exec", "history.read", "forwards.read", "monitor.read", "backgroundTasks.read"] };
    valid.views[0].provider = provider;
    validateManifest(valid, valid.id);
    const unicode = structuredClone(valid); unicode.views[0].title = "🖥".repeat(120);
    validateManifest(unicode, unicode.id);
    for (const mutate of [
      m => { m.views[0].provider = "unknown"; },
      m => { m.views[0].location = "sidebar"; },
      m => { m.views[0].kind = "blocks"; },
      m => { m.views[0].title = "Unsafe\nTitle"; },
      m => { m.views[0].title = "Unsafe\u0085Title"; },
      m => { m.views[0].title = "🖥".repeat(121); },
      m => { m.frontend = undefined; },
      m => { m.views = Array.from({length: 9}, (_, i) => ({...m.views[0], id: 'view'+i})); },
    ]) {
      const bad = structuredClone(valid); mutate(bad);
      assert.throws(() => validateManifest(bad, bad.id));
    }
  }
  for (const omitted of ["ui.trusted", "backgroundTasks.read"]) {
    const bad = structuredClone(manifest); bad.views[0].provider = "backgroundTasks";
    bad.permissions = ["ui.trusted", "backgroundTasks.read"].filter(p => p !== omitted);
    assert.throws(() => validateManifest(bad, bad.id), /frontend|provider/);
  }
  for (const omitted of ["ui.trusted", "sessions.read", "ssh.exec"]) {
    const bad = structuredClone(manifest); bad.views[0].provider = "terminal";
    bad.permissions = ["ui.trusted", "sessions.read", "ssh.exec"].filter(p => p !== omitted);
    assert.throws(() => validateManifest(bad, bad.id));
  }
  for (const omitted of ["ui.trusted", "sessions.read", "history.read"]) {
    const bad = structuredClone(manifest); bad.views[0].provider = "history";
    bad.permissions = ["ui.trusted", "sessions.read", "history.read"].filter(p => p !== omitted);
    assert.throws(() => validateManifest(bad, bad.id));
  }
    for (const omitted of ["ui.trusted", "sessions.read", "monitor.read"]) {
      const bad = structuredClone(manifest); bad.views[0].provider = "monitor";
      bad.permissions = ["ui.trusted", "sessions.read", "monitor.read"].filter(p => p !== omitted);
      assert.throws(() => validateManifest(bad, bad.id));
    }
    for (const omitted of ["ui.trusted", "hosts.read", "forwards.read"]) {
    const bad = structuredClone(manifest); bad.views[0].provider = "forwarding";
    bad.permissions = ["ui.trusted", "hosts.read", "forwards.read"].filter(p => p !== omitted);
    assert.throws(() => validateManifest(bad, bad.id));
  }
  const bad = structuredClone(manifest); bad.views[0].provider = "hostList";
  assert.throws(() => validateManifest(bad, bad.id));
  for (const omitted of ["fs.read", "sftp.read", "workspace.write"]) {
    const bad = structuredClone(manifest); bad.views[0].provider = "fileBrowser";
    bad.permissions = ["ui.trusted", "fs.read", "sftp.read", "workspace.write"].filter(p => p !== omitted);
    assert.throws(() => validateManifest(bad, bad.id));
  }
});

test("UI declarations synchronize from host discovery, reject drift and never expose private imports", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-ui-contract-"));
  const app = join(root, "app"), sdk = join(root, "sdk"), host = join(app, "src-tauri/src/plugins");
  try {
    await mkdir(host, { recursive: true }); await mkdir(sdk);
    await mkdir(join(app, "src/lib/extensions"), { recursive: true });
    await writeFile(join(app, "package.json"), JSON.stringify({ version: "0.26.1" }));
    await writeFile(join(host, "api.rs"), 'pub const METHODS: &[ApiMethod] = &[\n method!("extensions.describe", [], "{}", "Describe."),\n];');
    await writeFile(join(sdk, "tunnelde-plugin.d.mts"), 'export interface HostMethodMap {\n  "extensions.describe": [Record<string, never>, unknown];\n}\n');
    await writeFile(join(host, "extensions.json"), JSON.stringify({ version: 1, stability: "experimental", points: [], frontend: { sdkVersion: "0.1.0" } }));
    const contract = 'export interface UiSdk { readonly version: "0.1.0"; }\n';
    const path = join(app, "src/lib/extensions/uiSdkContract.ts");
    await writeFile(path, contract);
    await syncSdk(app, { sdkDirectory: sdk }); await syncSdk(app, { sdkDirectory: sdk, check: true });
    assert.equal(await readFile(join(sdk, "tunnelde-ui.d.mts"), "utf8"), contract);
    await writeFile(join(sdk, "tunnelde-ui.d.mts"), contract.replace("UiSdk", "Outdated"));
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /tunnelde-ui.d.mts differs/);
    await writeFile(path, contract + 'import type {Internal} from "@/store/private";\n');
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk }), /private types/);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("process providers require read authority but not terminate authority", () => {
  for (const omitted of ["ui.trusted", "sessions.read", "monitor.read"]) {
    const bad = structuredClone(manifest); bad.views[0].provider = "processes";
    bad.permissions = ["ui.trusted", "sessions.read", "monitor.read"].filter(p => p !== omitted);
    assert.throws(() => validateManifest(bad, bad.id));
  }
  const valid = structuredClone(manifest); valid.views[0].provider = "processes";
  valid.permissions = ["ui.trusted", "sessions.read", "monitor.read"];
  validateManifest(valid, valid.id);
});

test("quick-access providers require domain read permissions without invocation authority", () => {
  const permissions = ["ui.trusted", "hosts.read", "sessions.read", "fs.read", "sftp.read", "workspace.read", "editor.read"];
  const valid = {...structuredClone(manifest), permissions}; valid.views[0].provider = "quickAccess";
  validateManifest(valid, valid.id);
  for (const omitted of permissions) {
    const bad = {...structuredClone(valid), permissions: permissions.filter(p => p !== omitted)};
    assert.throws(() => validateManifest(bad, bad.id));
  }
});
