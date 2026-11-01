import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateRegistry } from "./validate.mjs";

const registry = await validateRegistry();
for (const entry of registry.plugins) {
  const response = await fetch(entry.url, { signal: AbortSignal.timeout(60000) });
  assert.ok(response.ok, `${entry.id}: HTTP ${response.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= 64 * 1024 * 1024, `${entry.id}: archive exceeds limit`);
    chunks.push(chunk);
  }
  assert.equal(createHash("sha256").update(Buffer.concat(chunks)).digest("hex"), entry.sha256, `${entry.id}: published checksum differs`);
  console.log(`${entry.id}@${entry.version}: verified`);
}
