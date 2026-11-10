import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { test } from "node:test";
import ts from "typescript";

test("legacy and domain SDK imports compile in NodeNext and preserve historical types", () => {
  const current = resolve("sdk/tunnelde-ui.d.mts");
  const historical = resolve("tests/fixtures/ui-sdk-0.1.0/contract.d.mts");
  assert.equal(createHash("sha256").update(readFileSync(historical, "utf8").replaceAll("\r\n", "\n")).digest("hex"), "5c3d4dd56cff9723724b6c43557a84459c8274783451c81c6e633f0e7a5e5339");
  const domains = readdirSync(resolve("sdk/ui"), { recursive: true })
    .filter(name => name.endsWith(".d.mts"))
    .map(name => resolve("sdk/ui", name));
  const program = ts.createProgram([current, historical, ...domains, resolve("sdk/tunnelde-plugin.d.mts")], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    noEmit: true,
    skipLibCheck: false,
    types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, "\n")), []);
  const checker = program.getTypeChecker();
  const exportsOf = path => new Map(checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(path))).map(symbol => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return [symbol.name, checker.getDeclaredTypeOfSymbol(target)];
  }));
  const before = exportsOf(historical), after = exportsOf(current);
  const added = [...after.keys()].filter(name => !before.has(name));
  assert.deepEqual(added.sort(), ["FrontendForwarding", "FrontendForwardingEntry", "FrontendForwardingSnapshot", "FrontendMonitor", "FrontendMonitorReading", "FrontendMonitorSample", "FrontendMonitorSnapshot"]);
  const widened = [];
  for (const [name, original] of before) {
    assert.ok(checker.isTypeAssignableTo(original, after.get(name)), `${name}: old to new`);
    if (!checker.isTypeAssignableTo(after.get(name), original)) widened.push(name);
  }
  assert.deepEqual(widened.sort(), ["FrontendProviderContribution", "FrontendProviderTarget"]);
  assert.deepEqual([...new Map(domains.flatMap(path => [...exportsOf(path)])).keys()].sort(), [...after.keys()].sort());
});
