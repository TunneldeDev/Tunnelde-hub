import test from "node:test";
import assert from "node:assert/strict";
import { validateRemoteRunner } from "../scripts/plugins/execution/manifest.mjs";

test("initialized runner opt-in is explicit, typed, and executable-only", () => {
  validateRemoteRunner({});
  validateRemoteRunner({remoteRunner:null});
  const valid = { permissions: ["ssh.exec"], remoteRunner: { configuration: "initialize-v1" } };
  validateRemoteRunner(valid);
  for (const remoteRunner of [[], {}, { configuration: "file" }, { configuration: "initialize-v1", fallback: true }])
    assert.throws(() => validateRemoteRunner({ ...valid, remoteRunner }));
  for (const runtime of ["wasm", "frontend"]) validateRemoteRunner({ ...valid, runtime });
  for (const runtime of ["theme", "declarative"])
    assert.throws(() => validateRemoteRunner({ ...valid, runtime }));
  assert.throws(() => validateRemoteRunner({ ...valid, permissions: [] }));
});
