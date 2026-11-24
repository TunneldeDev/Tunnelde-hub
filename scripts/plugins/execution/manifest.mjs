import assert from "node:assert/strict";

export function validateRemoteRunner(manifest) {
  if (manifest.remoteRunner == null) return;
  const declaration = manifest.remoteRunner;
  assert.ok(declaration && typeof declaration === "object" && !Array.isArray(declaration) &&
    Object.keys(declaration).length === 1 && declaration.configuration === "initialize-v1",
    "remoteRunner requires configuration: initialize-v1");
  assert.ok(!["theme", "declarative"].includes(manifest.runtime) && manifest.permissions?.includes("ssh.exec"),
    "remoteRunner requires an executable runtime and ssh.exec permission");
}
