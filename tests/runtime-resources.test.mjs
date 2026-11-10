import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import ts from "typescript";
import { createRuntimeResourcesClient } from "../sdk/runtime/resources/client.mjs";

test("resource facade preserves pagination revisions and exact handles through the owner transport", async () => {
  const calls = [], host = {call:async (method, params) => {calls.push([method,params]);return params;}};
  const client=createRuntimeResourcesClient(host), page={offset:128,revision:"a".repeat(64)}, request={handle:"b".repeat(64)};
  await client.snapshot(); assert.equal(await client.snapshot(page),page);assert.equal(await client.release(request),request);
  assert.deepEqual(calls,[["resources.snapshot",{}],["resources.snapshot",page],["resources.release",request]]);assert(Object.isFrozen(client));
});
test("strict runtime resources types exclude foreign targets and invalid methods without a fallback overload", () => {
  const program=ts.createProgram([resolve("tests/fixtures/runtime-resources/consumer.mts")],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noEmit:true,skipLibCheck:false,types:["node"]});
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
