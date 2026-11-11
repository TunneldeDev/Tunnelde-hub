import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

test("profile mutation facades, root exports and UI/RPC DTOs compile with owner and privacy contracts", () => {
  const program = ts.createProgram([resolve("tests/fixtures/profiles-mutations/consumer.mts")], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: false, types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
});
