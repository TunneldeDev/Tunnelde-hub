import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import ts from "typescript";

test("content SDK requires explicit endpoint and owner and exposes only read-only bytes",()=>{
  const program=ts.createProgram([resolve("tests/fixtures/file-content/consumer.mts")],{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,strict:true,noEmit:true,skipLibCheck:false,types:["node"]});
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d=>ts.flattenDiagnosticMessageText(d.messageText,"\n")),[]);
});
