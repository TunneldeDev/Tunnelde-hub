import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fetchArchive } from "../scripts/audit.mjs";

const bytes = Buffer.from("verified archive");
const entry = { id: "sample", url: "https://example.invalid/archive.zip", sha256: createHash("sha256").update(bytes).digest("hex") };

test("audit retries temporary server and network failures before verifying bytes", async () => {
  let calls = 0;
  const delays = [];
  await fetchArchive(entry, {
    fetcher: async () => {
      calls++;
      if (calls === 1) return new Response("busy", { status: 504 });
      if (calls === 2) throw new Error("network unavailable");
      return new Response(bytes);
    },
    wait: async (ms) => delays.push(ms),
  });
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test("audit fails immediately for missing archives or changed bytes", async () => {
  for (const response of [new Response("missing", { status: 404 }), new Response("changed")]) {
    let calls = 0;
    await assert.rejects(fetchArchive(entry, { fetcher: async () => { calls++; return response; }, wait: async () => {} }));
    assert.equal(calls, 1);
  }
});

test("audit fails after its bounded retry count", async () => {
  let calls = 0;
  await assert.rejects(fetchArchive(entry, { fetcher: async () => { calls++; return new Response("busy", { status: 503 }); }, wait: async () => {} }), /HTTP 503/);
  assert.equal(calls, 3);
});

test("audit retries a broken response body from the beginning and verifies the full archive", async () => {
  let calls = 0;
  const waits = [];
  await fetchArchive(entry, {
    fetcher: async () => {
      calls++;
      if (calls === 1) return new Response(new ReadableStream({
        start(controller) { controller.enqueue(bytes.subarray(0, 4)); },
        pull(controller) { controller.error(new Error("connection reset")); },
      }));
      return new Response(bytes);
    },
    wait: async (ms) => waits.push(ms),
  });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
});

test("audit gives up after repeated body failures and never retries an oversized archive", async () => {
  let calls = 0;
  await assert.rejects(fetchArchive(entry, {
    fetcher: async () => { calls++; return new Response(new ReadableStream({
      pull(controller) { controller.error(new Error("broken stream")); },
    })); },
    wait: async () => {},
  }), /broken stream/);
  assert.equal(calls, 3);
  calls = 0;
  const chunk = new Uint8Array(1024 * 1024);
  await assert.rejects(fetchArchive(entry, {
    fetcher: async () => { calls++; let count = 0; return new Response(new ReadableStream({
      pull(controller) { if (++count <= 65) controller.enqueue(chunk); else controller.close(); },
    })); },
    wait: async () => {},
  }), /archive exceeds limit/);
  assert.equal(calls, 1);
});
