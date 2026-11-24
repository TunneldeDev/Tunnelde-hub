import assert from "node:assert/strict";

export function validateFilePreviews(providers = []) {
  assert.ok(Array.isArray(providers) && providers.length <= 16, "Too many preview providers");
  const ids = new Set();
  for (const provider of providers) {
    assert.ok(provider && typeof provider === "object" && !Array.isArray(provider), "Invalid preview provider");
    assert.ok(Object.keys(provider).every((key) => ["id", "name", "renderer", "extensions"].includes(key)), "Unknown preview fields");
    assert.ok(typeof provider.id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(provider.id) && !ids.has(provider.id), "Invalid preview identity");
    ids.add(provider.id);
    assert.ok(typeof provider.name === "string" && provider.name.trim() && Buffer.byteLength(provider.name) <= 120 && !/\p{Cc}/u.test(provider.name), "Invalid preview name");
    assert.ok(["image", "audio", "video", "pdf", "markdown", "text"].includes(provider.renderer), "Unknown preview renderer");
    assert.ok(Array.isArray(provider.extensions) && provider.extensions.length > 0 && provider.extensions.length <= 128, "Invalid preview suffixes");
    const extensions = new Set();
    for (const extension of provider.extensions) {
      assert.ok(typeof extension === "string" && extension.length <= 64 && /^[a-z0-9][a-z0-9.+-]*$/i.test(extension) && !extension.endsWith(".") && !extensions.has(extension.toLowerCase()), "Invalid or duplicate preview suffix");
      extensions.add(extension.toLowerCase());
    }
  }
}
