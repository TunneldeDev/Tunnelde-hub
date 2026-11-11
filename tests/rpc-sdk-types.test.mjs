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
  // The frozen consumer deliberately assigns a new host to its old exhaustive
  // experimental target union. That one assignment is expected to reject the
  // additive forwarding target; every other historical consumer must compile.
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 1);
  const diagnostic = diagnostics[0];
  assert.equal(diagnostic.code, 2322);
  assert.equal(diagnostic.file.fileName, consumer.replaceAll("\\", "/"));
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  assert.match(diagnostic.file.text.split(/\r?\n/)[location.line], /^const hostToOld:/);
  assert.match(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"), /extensions\.describe/);
  const checker = program.getTypeChecker();
  // Generic parameters from separate modules have distinct compiler identities;
  // their declaration text is checked alongside instantiated consumer assignments.
  const exportsOf = path => new Map(checker.getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(path))).map(symbol => {
    const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return [symbol.name, target];
  }));
  const before = exportsOf(historical), after = exportsOf(current);
  const widened = [];
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
      // Adding RPCs makes the complete map require more keys. Historical
      // method contracts are checked individually below, without weakening
      // the compatibility requirements for every other exported type.
      if (name !== "HostMethodMap")
        assert.ok(checker.isTypeAssignableTo(typeOf(original), typeOf(next)), `${name}: old to new`);
      if (!checker.isTypeAssignableTo(typeOf(next), typeOf(original))) widened.push(name);
    }
  }
  // Experimental runner results always included notFound at runtime; the
  // corrected declaration explicitly widens only those result contracts.
  assert.deepEqual(widened.sort(), ["ExtensionDirectory", "Host", "HostMethodMap", "PluginView", "RunnerPoll", "RunnerState", "createPlugin"].sort());
  const oldMap = checker.getDeclaredTypeOfSymbol(before.get("HostMethodMap"));
  const newMap = checker.getDeclaredTypeOfSymbol(after.get("HostMethodMap"));
  const oldNames = new Set(oldMap.getProperties().map(p => p.name));
  assert.ok([...oldNames].every(name => newMap.getProperty(name)), "Missing historical RPC");
  const widenedMethods = [];
  for (const property of oldMap.getProperties()) {
    const next = newMap.getProperty(property.name);
    const oldType = checker.getTypeOfSymbolAtLocation(property, property.valueDeclaration);
    const nextType = checker.getTypeOfSymbolAtLocation(next, next.valueDeclaration);
    assert.ok(checker.isTypeAssignableTo(oldType, nextType), `${property.name}: historical request/result changed`);
    if (!checker.isTypeAssignableTo(nextType, oldType)) widenedMethods.push(property.name);
    const oldInput = checker.getTypeArguments(oldType)[0];
    const nextInput = checker.getTypeArguments(nextType)[0];
    assert.ok(checker.isTypeAssignableTo(oldInput, nextInput), `${property.name}: historical input rejected`);
    assert.ok(checker.isTypeAssignableTo(nextInput, oldInput), `${property.name}: historical input widened`);
  }
  assert.deepEqual(widenedMethods.sort(), ["extensions.describe", "runners.poll", "runners.status"]);
  assert.deepEqual(newMap.getProperties().map(p => p.name).filter(name => !oldNames.has(name)).sort(),
    ["configuration.backups", "configuration.deleteBackup", "configuration.migrate", "configuration.restore", "configuration.schema", "configuration.snapshot", "configuration.update", "editor.applyEdits", "editor.observe", "editor.readRange", "fileBrowser.action", "fileBrowser.observe", "fileBrowser.read", "files.content.close", "files.content.observe", "files.content.open", "files.content.prepare", "files.content.read", "logs.read", "preferences.observe", "preferences.schema", "preferences.snapshot", "preferences.update", "profiles.activate", "profiles.catalogue", "profiles.delete", "profiles.drafts.append", "profiles.drafts.discard", "profiles.drafts.prepare", "profiles.observe", "profiles.read", "profiles.rename", "profiles.save", "resources.identify", "resources.release", "resources.snapshot", "runners.review", "runners.startInitialized", "storage.locations.cancel", "storage.locations.observe", "storage.locations.schedule", "storage.observe", "storage.recovery.observe", "storage.recovery.request"]);
  // Freeze normalized text so fixture changes cannot silently make compatibility pass.
  const hash = createHash("sha256").update(readFileSync(historical, "utf8").replaceAll("\r\n", "\n")).digest("hex");
  assert.equal(hash, "d50bf0fdcdbe2eb0dd6b538981ccd82a93d2eb0d2128b565c56c8b02a16fb309");
});

test("runner status consumers handle missing runners through both RPC results", () => {
  const program = ts.createProgram([resolve("tests/fixtures/runner-state/consumer.mts")], {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true, noEmit: true, skipLibCheck: false, types: ["node"],
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
});

test("editor buffer facade compiles with generated RPC/UI data and owned cancellation", () => {
  const program = ts.createProgram([resolve("tests/fixtures/editor-buffer/consumer.mts")], {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true,
    noEmit: true, skipLibCheck: false, types: ["node"],
  });
  assert.deepEqual(ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), []);
});
