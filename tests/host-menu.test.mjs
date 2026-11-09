import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateManifest } from "../scripts/validate.mjs";
import { syncSdk } from "../scripts/sync-sdk.mjs";

const manifest = {
  id: "host-tool", name: "Host tool", description: "Host menu example", author: "Example",
  version: "1.0.0", apiVersion: 1, runtime: "node", main: "index.mjs", readme: "README.md",
  permissions: ["hosts.read"], commands: [{ id: "inspect", title: "Inspect host", hostMenu: true }],
};

test("host menu commands require hosts.read and an unambiguous bounded context", () => {
  validateManifest(manifest, manifest.id);
  validateManifest({ ...manifest, commands: Array.from({ length: 16 }, (_, i) => ({ ...manifest.commands[0], id: `inspect-${i}` })) }, manifest.id);
  for (const mutate of [
    m => { m.permissions = []; },
    m => { m.commands[0].hostMenu = "yes"; },
    m => { m.commands[0].title = "x".repeat(121); },
    m => { m.commands[0].title = "Inspect\nhost"; },
    m => { m.commands[0].fileMenu = { sources: ["local"], kinds: ["file"] }; },
    m => { m.commands[0].editor = { extensions: ["json"] }; },
    m => { m.commands = Array.from({ length: 17 }, (_, i) => ({ ...m.commands[0], id: `inspect-${i}` })); },
  ]) {
    const bad = structuredClone(manifest); mutate(bad);
    assert.throws(() => validateManifest(bad, bad.id));
  }
  validateManifest({ ...manifest, permissions: [], commands: [{ ...manifest.commands[0], hostMenu: false }] }, manifest.id);
});

test("the trusted UI example handles the selected host context", async () => {
  const { activate } = await import("../examples/trusted-ui/ui/index.mjs");
  const commands = new Map();
  activate({ sdk: { react: {}, components: {} }, views: { register() {} }, commands: { register(id, handler) { commands.set(id, handler); } } });
  assert.deepEqual(commands.get("inspect-host")({ host: { name: "Selected", address: "example.org", port: 2222 } }), { text: "Selected: example.org:2222" });
});

test("manifest point discovery synchronizes host menu DTOs and rejects stale contracts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-host-menu-"));
  const app = join(root, "app"), sdk = join(root, "sdk"), native = join(app, "src-tauri/src/plugins");
  try {
    await mkdir(native, { recursive: true }); await mkdir(sdk);
    await mkdir(join(app, "src/lib/plugins"), { recursive: true });
    await writeFile(join(app, "package.json"), '{"version":"0.34.0"}');
    await writeFile(join(native, "api.rs"), 'pub const METHODS: &[ApiMethod] = &[\n method!("extensions.describe", [], "{}", "Describe."),\n];');
    await writeFile(join(sdk, "tunnelde-plugin.d.mts"), 'export interface HostMethodMap {\n  "extensions.describe": [Record<string, never>, unknown];\n}\n');
    const point = { id: "hostList.menu", stability: "experimental", ownership: "manifest", permissions: ["hosts.read"], registration: { manifest: "commands[].hostMenu" }, limits: { perPlugin: 16, total: 128 } };
    await writeFile(join(native, "extensions.json"), JSON.stringify({ version: 1, stability: "experimental", points: [point] }));
    const contract = '// BEGIN GENERATED HOST MENU V1 TYPES\nexport interface HostMenuCommandInput { host: { id: string } }\n// END GENERATED HOST MENU V1 TYPES';
    await writeFile(join(app, "src/lib/plugins/hostMenu.ts"), contract);
    await syncSdk(app, { sdkDirectory: sdk }); await syncSdk(app, { sdkDirectory: sdk, check: true });
    const types = await readFile(join(sdk, "tunnelde-plugin.d.mts"), "utf8");
    assert.ok(types.includes(contract));
    await writeFile(join(sdk, "tunnelde-plugin.d.mts"), types.replace("id: string", "id: number"));
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /Host menu DTOs differ/);
    point.permissions = [];
    await writeFile(join(native, "extensions.json"), JSON.stringify({ version: 1, stability: "experimental", points: [point] }));
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk }), /deep-equal/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
