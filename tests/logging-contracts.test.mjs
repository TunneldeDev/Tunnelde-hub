import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import ts from "typescript";
import { syncLoggingContracts } from "../scripts/sdk/logging/contracts.mjs";

test("log DTO/schema drift is detected without modifying check-mode artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tunnelde-log-contract-")),
    app = join(root, "app"),
    sdk = join(root, "sdk");
  const write = async (path, text) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text);
  };
  try {
    await write(
      join(app, "src/lib/extensions/contracts/logging/entry.ts"),
      "export interface Entry { readonly message: string; }\n",
    );
    await write(
      join(app, "src-tauri/src/plugins/api/domains/logging/schema.json"),
      "{}",
    );
    await syncLoggingContracts(app, sdk, false);
    await syncLoggingContracts(app, sdk, true);
    const dto = join(sdk, "rpc/logging/data/entry.d.mts"),
      initial = await readFile(dto, "utf8");
    await write(dto, "stale");
    await assert.rejects(
      syncLoggingContracts(app, sdk, true),
      /Log contract differs/,
    );
    assert.equal(await readFile(dto, "utf8"), "stale");
    await write(dto, initial);
    await write(join(sdk, "logging/schema.json"), "stale");
    await assert.rejects(
      syncLoggingContracts(app, sdk, true),
      /Log schema differs/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("log RPC and facade types expose structured immutable entries and cancellation", () => {
  const program = ts.createProgram(
    [resolve("tests/fixtures/logging/consumer.mts")],
    {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      types: ["node"],
    },
  );
  assert.deepEqual(
    ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n")),
    [],
  );
});
