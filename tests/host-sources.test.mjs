import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { syncSdk } from "../scripts/sync-sdk.mjs";

test("host source discovery checks DTOs, page results and distinct read/write permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-host-sources-"));
  const app = join(root, "app"), sdk = join(root, "sdk"), native = join(app, "src-tauri/src/plugins");
  try {
    await mkdir(native, { recursive: true }); await mkdir(sdk);
    await mkdir(join(app, "src/lib/hosts"), { recursive: true });
    await writeFile(join(app, "package.json"), '{"version":"0.34.0"}');
    await writeFile(join(native, "api.rs"), `pub const METHODS: &[ApiMethod] = &[
      method!("extensions.describe", [], "{}", "Describe."),
      method!("hosts.setSource", ["hosts.read", "hosts.write"], "{}", "Set."),
      method!("hosts.removeSource", ["hosts.read", "hosts.write"], "{}", "Remove."),
      method!("hosts.sourcesSnapshot", ["hosts.read"], "{}", "Read."),

];`);
    const types = `export interface HostMethodMap {
  "extensions.describe": [{}, unknown];
  "hosts.setSource": [HostSource, null];
  "hosts.removeSource": [{ id: string }, boolean];
  "hosts.sourcesSnapshot": [{ offset?: number; revision?: number }, HostSourcesPage];
}
`;
    const path = join(sdk, "tunnelde-plugin.d.mts"), dto = join(app, "src/lib/hosts/sources.ts");
    const point = { id: "hosts.sources", stability: "experimental", ownership: "runtime",
      permissions: ["hosts.read", "hosts.write"], readPermissions: ["hosts.read"],
      registration: { set: "hosts.setSource", remove: "hosts.removeSource", read: "hosts.sourcesSnapshot" } };
    const extension = () => writeFile(join(native, "extensions.json"), JSON.stringify({ version: 1, stability: "experimental", points: [point] }));
    const contract = "// BEGIN GENERATED HOST SOURCES V1 TYPES\nexport interface HostSource { entries: string[] }\nexport interface HostSourcesPage { nextOffset: number | null }\n// END GENERATED HOST SOURCES V1 TYPES";
    await extension(); await writeFile(path, types); await writeFile(dto, contract);
    await syncSdk(app, { sdkDirectory: sdk }); await syncSdk(app, { sdkDirectory: sdk, check: true });
    const expected = await readFile(path, "utf8");
    assert(expected.includes(contract));
    await writeFile(dto, contract.replace("entries: string[]", "entries: number[]"));
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk, check: true }), /Host source DTOs differ/);
    await writeFile(dto, contract); point.readPermissions = [];
    await extension();
    await assert.rejects(syncSdk(app, { sdkDirectory: sdk }), /Extension permissions differ/);
    assert.equal(await readFile(path, "utf8"), expected);
  } finally { await rm(root, { recursive: true, force: true }); }
});
