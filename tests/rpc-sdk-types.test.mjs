import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { loadRpcDeclarations } from "../scripts/sdk/rpc/declarations.mjs";

test("all legacy RPC SDK imports and domain types retain their historical contracts", async () => {
  const current = resolve("sdk/tunnelde-plugin.d.mts");
  const historical = resolve("tests/fixtures/rpc-sdk-v1/contract.d.mts");
  const graph = await loadRpcDeclarations(resolve("sdk"));
  const files = [...graph.files.keys()].map(name => resolve("sdk", name));
  const consumer = resolve("tests/fixtures/rpc-sdk-v1/consumer.mts");
  const program = ts.createProgram([historical, consumer, ...files], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: false, types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  const checker = program.getTypeChecker();
  // Generic parameters from separate modules have distinct compiler identities;
  // their declaration text is checked alongside instantiated consumer assignments.
  const exportsOf = path => new Map(checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(path))).map(symbol => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return [symbol.name, target];
  }));
  const before = exportsOf(historical), after = exportsOf(current);
  for (const [name, original] of before) {
    assert.ok(after.has(name), `Missing legacy export: ${name}`);
    const next = after.get(name);
    const typeOf = symbol => symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias)
      ? checker.getDeclaredTypeOfSymbol(symbol)
      : checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration);
    if (original.declarations.some(declaration => declaration.typeParameters?.length)) {
      const oldDeclaration = original.declarations[0], newDeclaration = next.declarations[0];
      assert.equal(oldDeclaration.getText().replace(/\s+/g, " "), newDeclaration.getText().replace(/\s+/g, " "), `${name}: generic declaration changed`);
    } else {
      assert.ok(checker.isTypeAssignableTo(typeOf(original), typeOf(next)), `${name}: old to new`);
      assert.ok(checker.isTypeAssignableTo(typeOf(next), typeOf(original)), `${name}: new to old`);
    }
  }
  const oldMap = checker.getDeclaredTypeOfSymbol(before.get("HostMethodMap"));
  const newMap = checker.getDeclaredTypeOfSymbol(after.get("HostMethodMap"));
  assert.deepEqual(oldMap.getProperties().map(p => p.name).sort(), newMap.getProperties().map(p => p.name).sort());
  // Freeze normalized text so fixture changes cannot silently make compatibility pass.
  const hash = createHash("sha256").update(readFileSync(historical, "utf8").replaceAll("\r\n", "\n")).digest("hex");
  assert.equal(hash, "d50bf0fdcdbe2eb0dd6b538981ccd82a93d2eb0d2128b565c56c8b02a16fb309");
});
