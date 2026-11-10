import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";

/** Compare declared bounds to the implemented host, not another hand maintained
 * catalogue. No new public RPC methods are introduced for native admission. */
export async function checkActivation(directory, applicationDirectory) {
  const activation = directory.runtime?.activation;
  if (!activation) return; // Released older hosts remain valid sync targets.
  assert.equal(activation.manifest, "dependencies");
  assert.equal(activation.manifestApiVersion, 2);
  assert.equal(activation.rpcApiVersion, 1);
  assert.equal(activation.stability, "experimental");
  assert.equal(activation.automaticInstallation, false);
  for (const [key, value] of Object.entries({
    declaration:"required-installed-runtime", ordering:"dependencies-first", preflight:"whole-graph-before-engines",
    approval:"per-package-fingerprint-and-generation", sharing:"per-runtime-with-independent-waiters",
    retirement:"reverse-dependents", readyDependencies:"retained-after-root-failure",
  })) assert.equal(activation[key], value);
  const limits = await readFile(join(applicationDirectory,"src-tauri/src/plugins/runtime/activation/limits.rs"),"utf8");
  for (const [key, constant] of Object.entries({catalogue:"MAX_CATALOGUE",dependencies:"MAX_DEPENDENCIES",packages:"MAX_PACKAGES",edges:"MAX_EDGES",depth:"MAX_DEPTH",rangeBytes:"MAX_RANGE_BYTES",requests:"MAX_REQUESTS",blockingWorkers:"MAX_BLOCKING_WORKERS",preflightTimeoutMs:"PREFLIGHT_TIMEOUT_MS"})) {
    const maximum = limits.match(new RegExp(`const ${constant}: (?:usize|u64) = ([\\d_]+);`));
    assert.ok(maximum, `Missing activation constant ${constant}`);
    assert.equal(activation.limits[key], Number(maximum[1].replaceAll("_","")), `Activation ${key} limit differs from implementation`);
  }
  const manifest = await readFile(join(applicationDirectory,"src-tauri/src/plugins/manifest.rs"),"utf8");
  assert.match(manifest,/const DEPENDENCY_API_VERSION: u32 = 2;/);
  assert.match(manifest,/const API_VERSION: u32 = 1;/);
}
