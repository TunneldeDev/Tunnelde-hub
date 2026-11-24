import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { validateRegistry } from "./validate.mjs";

const transientStatus = (status) => status === 408 || status === 429 || status >= 500;

export async function fetchArchive(entry, { fetcher = fetch, wait = delay, attempts = 3 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let response;
    try {
      response = await fetcher(entry.url, { signal: AbortSignal.timeout(60000) });
    } catch (error) {
      if (attempt + 1 === attempts) throw error;
      await wait(1000 * 2 ** attempt);
      continue;
    }
    if (!response.ok && transientStatus(response.status) && attempt + 1 < attempts) {
      await response.body?.cancel().catch(() => {});
      await wait(1000 * 2 ** attempt);
      continue;
    }
    assert.ok(response.ok, `${entry.id}: HTTP ${response.status}`);
    const hash = createHash("sha256");
    let size = 0;
    const reader = response.body.getReader();
    let streamError;
    let streamFailed = false;
    try {
      while (true) {
        let result;
        try {
          result = await reader.read();
        } catch (error) {
          streamError = error;
          streamFailed = true;
          break;
        }
        if (result.done) break;
        size += result.value.length;
        assert.ok(size <= 64 * 1024 * 1024, `${entry.id}: archive exceeds limit`);
        hash.update(result.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (streamFailed) {
      if (attempt + 1 === attempts) throw streamError;
      await wait(1000 * 2 ** attempt);
      continue;
    }
    assert.equal(hash.digest("hex"), entry.sha256, `${entry.id}: published checksum differs`);
    return;
  }
  throw new Error(`${entry.id}: no download attempts configured`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const registry = await validateRegistry();
  for (const entry of registry.plugins) {
    await fetchArchive(entry);
    console.log(`${entry.id}@${entry.version}: verified`);
  }
}
