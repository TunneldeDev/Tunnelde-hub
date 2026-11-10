import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateDependencies } from "../scripts/plugins/activation/manifest.mjs";
import { checkActivation } from "../scripts/sdk/runtime/activation/discovery.mjs";

test("dependency declarations reject v1 hosts without changing v1 declarations", () => {
  validateDependencies({id:"root",apiVersion:1});
  validateDependencies({id:"root",apiVersion:1,dependencies:[]});
  const declaration={id:"root",apiVersion:2,dependencies:[{id:"shared",version:"^1.0"}]};
  validateDependencies(declaration);
  assert.throws(()=>validateDependencies({...declaration,apiVersion:1}));
  assert.throws(()=>validateDependencies({...declaration,runtime:"theme"}));
  assert.throws(()=>validateDependencies({...declaration,apiVersion:3}));
});

test("dependency declaration metadata is bounded, unique and unambiguous", () => {
  for (const dependencies of [null,{},"shared",[{id:"root",version:"^1"}],
    [{id:"../shared",version:"^1"}],[{id:"shared",version:""}],[{id:"shared",version:" ^1"}],
    [{id:"shared",version:"x".repeat(161)}],[{id:"shared",version:"^1\n"}],
    [{id:"shared",version:"^1",optional:true}],
    [{id:"shared",version:"^1"},{id:"shared",version:"^2"}],
    Array.from({length:17},(_,i)=>({id:"shared"+i,version:"^1"}))]) {
    assert.throws(()=>validateDependencies({id:"root",apiVersion:2,dependencies}));
  }
});

test("activation discovery rejects host limit and protocol drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-activation-discovery-"));
  const runtime = join(root, "src-tauri/src/plugins/runtime/activation");
  const directory = JSON.parse(await readFile(new URL("../sdk/extensions.json", import.meta.url), "utf8"));
  const limits = `pub const MAX_CATALOGUE: usize = 4_096;
pub const MAX_DEPENDENCIES: usize = 16;
pub const MAX_PACKAGES: usize = 64;
pub const MAX_EDGES: usize = 256;
pub const MAX_DEPTH: usize = 32;
pub const MAX_RANGE_BYTES: usize = 160;
pub const MAX_REQUESTS: usize = 16;
pub const MAX_BLOCKING_WORKERS: usize = 16;
pub const PREFLIGHT_TIMEOUT_MS: u64 = 60_000;`;
  const manifest = "pub const API_VERSION: u32 = 1;\npub const DEPENDENCY_API_VERSION: u32 = 2;";
  try {
    await mkdir(runtime, {recursive:true});
    await writeFile(join(runtime, "limits.rs"), limits);
    const manifestPath = join(root, "src-tauri/src/plugins/manifest.rs");
    await writeFile(manifestPath, manifest);
    await checkActivation(directory, root);
    for (const key of Object.keys(directory.runtime.activation.limits)) {
      const changed = structuredClone(directory);
      changed.runtime.activation.limits[key]++;
      await assert.rejects(checkActivation(changed, root), /differs from implementation/);
    }
    const changed = structuredClone(directory);
    changed.runtime.activation.manifestApiVersion = 1;
    await assert.rejects(checkActivation(changed, root));
    await writeFile(manifestPath, manifest.replace("DEPENDENCY_API_VERSION: u32 = 2", "DEPENDENCY_API_VERSION: u32 = 3"));
    await assert.rejects(checkActivation(directory, root));
    await writeFile(manifestPath, manifest);
    await writeFile(join(runtime, "limits.rs"), limits.replace("MAX_REQUESTS", "REMOVED_REQUEST_LIMIT"));
    await assert.rejects(checkActivation(directory, root), /Missing activation constant/);
  } finally {
    await rm(root, {recursive:true, force:true});
  }
});

test("older host discovery does not require new activation source files", async () => {
  await checkActivation({}, "nonexistent-old-host");
  await checkActivation({runtime:{}}, "nonexistent-old-host");
});
