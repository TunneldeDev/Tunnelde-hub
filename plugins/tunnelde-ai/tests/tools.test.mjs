import test from "node:test";
import assert from "node:assert/strict";
import { invokeTool } from "../lib/tools.mjs";

const config = { mode: "ask", scope: { localRoots: ["/work"], sessionIds: [], remoteRoots: [] } };
const command = { name: "run_command", arguments: { executable: "/bin/test", args: [], cwd: "/work" } };

function hostFor(read, status) {
  let reads = 0;
  const calls = [];
  return { calls, async call(method, params) {
    calls.push({ method, params });
    if (method === "tools.invoke") return { taskId: "task" };
    if (method === "tasks.readOutput") return read(++reads, params.afterSeq);
    if (method === "tasks.status") return status();
    if (method === "tasks.cancel") return true;
    throw new Error(`Unexpected ${method}`);
  } };
}

test("command output drains all terminal pages without a separate status race", async () => {
  const host = hostFor((read) => {
    if (read === 1) return { status: "completed", exitCode: 0, events: [{ seq: 1, data: "first" }] };
    if (read === 2) return { status: "completed", exitCode: 0, events: [{ seq: 2, data: " final" }] };
    return { status: "completed", exitCode: 0, events: [] };
  }, () => ({ status: "completed", exitCode: 0 }));
  const result = await invokeTool(host, config, command);
  assert.equal(result.output, "first final");
  assert.deepEqual(host.calls.filter((item) => item.method === "tasks.readOutput").map((item) => item.params.afterSeq), [0, 1, 2]);
  assert.equal(host.calls.filter((item) => item.method === "tasks.status").length, 1);
});

test("older hosts drain output produced between read and status", async () => {
  const host = hostFor((read) => ({ events: read === 1 ? [] : read === 2 ? [{ seq: 1, data: "tail" }] : [] }), () => ({ status: "completed", exitCode: 0 }));
  const result = await invokeTool(host, config, command);
  assert.equal(result.output, "tail");
  assert.equal(host.calls.filter((item) => item.method === "tasks.readOutput").length, 3);
});

test("truncated output and disappeared tasks fail and cancel instead of returning incomplete results", async () => {
  for (const response of [{ status: "completed", truncated: true, events: [] }, { events: [] }]) {
    const host = hostFor(() => response, () => null);
    await assert.rejects(invokeTool(host, config, command), /buffer|no longer available/);
    assert.equal(host.calls.filter((item) => item.method === "tasks.cancel").length, 1);
  }
});
