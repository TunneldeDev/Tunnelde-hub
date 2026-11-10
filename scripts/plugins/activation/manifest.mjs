import assert from "node:assert/strict";

/** Validate publication metadata; the host's Rust SemVer parser remains the
 * authority for version matching, including prerelease eligibility. */
export function validateDependencies(manifest) {
  assert.ok([1, 2].includes(manifest.apiVersion), `${manifest.id}: unsupported API`);
  const dependencies = manifest.dependencies === undefined ? [] : manifest.dependencies;
  assert.ok(Array.isArray(dependencies) && dependencies.length <= 16, "Invalid required dependencies");
  assert.ok(!dependencies.length || (manifest.apiVersion === 2 && manifest.runtime !== "theme"),
    "Required runtime dependencies need manifest apiVersion 2 and an executable runtime");
  const seen = new Set();
  for (const dependency of dependencies) {
    assert.ok(dependency && typeof dependency === "object" && !Array.isArray(dependency) &&
      Object.keys(dependency).length === 2 && Object.keys(dependency).every(key => ["id", "version"].includes(key)),
      "Dependencies contain only id and version");
    assert.ok(typeof dependency.id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(dependency.id) &&
      dependency.id !== manifest.id && !seen.has(dependency.id), "Invalid, duplicate or self dependency");
    seen.add(dependency.id);
    assert.ok(typeof dependency.version === "string" && dependency.version.trim() === dependency.version &&
      Buffer.byteLength(dependency.version) > 0 && Buffer.byteLength(dependency.version) <= 160 &&
      !/\p{Cc}/u.test(dependency.version), "Invalid dependency version range");
  }
}
