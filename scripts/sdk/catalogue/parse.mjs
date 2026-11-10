import assert from "node:assert/strict";

export function parseRustCatalogue(source, contracts) {
  const body = source.match(/pub const METHODS:[\s\S]*?=\s*&\[([\s\S]*?)\n\];/)?.[1];
  assert.ok(body, "Rust METHODS catalogue was not found");
  const entries = body.replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (token) =>
    token.startsWith('"') ? token : " ",
  );
  const literal = '"(?:\\\\.|[^"\\\\])*"';
  const pattern = new RegExp(
    `(?<![\\w])(stable_method|method)!\\(\\s*(${literal})\\s*,\\s*\\[([^\\]]*)\\]\\s*,\\s*(${literal})\\s*,\\s*(${literal})(?:\\s*,\\s*(${literal}))?\\s*\\)`,
    "g",
  );
  const methods = [...entries.matchAll(pattern)].map((entry) => {
    const stability = entry[1] === "stable_method" ? "stable" : "experimental";
    assert.equal(
      stability === "stable",
      Boolean(entry[6]),
      `${entry[2]}: stable methods must declare since`,
    );
    return {
      name: JSON.parse(entry[2]),
      permissions: JSON.parse(`[${entry[3]}]`),
      params: JSON.parse(entry[4]),
      description: JSON.parse(entry[5]),
      stability,
      since: entry[6] ? JSON.parse(entry[6]) : null,
      deprecated: null,
    };
  });
  // Reject every unrecognized catalogue entry, not just malformed known macros.
  const remainder = entries
    .replace(pattern, "")
    .replace(/[\s,]/g, "");
  assert.equal(remainder, "", "Unparsed host method or unsupported catalogue entry");
  assert.ok(methods.length > 0, "Host catalogue is empty");
  return attachContracts(methods, source, contracts);
}

/** Validate the complete catalogue and its stable schemas after domain assembly. */
export function attachContracts(methods, source, contracts) {
  assert.equal(
    new Set(methods.map(({ name }) => name)).size,
    methods.length,
    "Duplicate host method",
  );
  const expectsContracts = /include_str!\(\s*"contracts\/core-v1\.json"\s*\)/.test(source);
  assert.equal(expectsContracts, contracts !== undefined, "Host core contracts are missing or unexpected");
  if (expectsContracts) {
    assert.equal(contracts?.version, 1, "Unsupported core contract version");
    assert.ok(contracts.methods && typeof contracts.methods === "object" && !Array.isArray(contracts.methods), "Invalid core contract methods");
    for (const [name, contract] of Object.entries(contracts.methods)) {
      const method = methods.find((entry) => entry.name === name);
      assert.equal(method?.stability, "stable", `Contract for unknown or non-stable method: ${name}`);
      assert.equal(contract.version, 1, `Invalid contract version: ${name}`);
      for (const field of ["inputSchema", "resultSchema", "errorSchema"]) {
        assert.ok(contract[field] && typeof contract[field] === "object" && !Array.isArray(contract[field]), `Missing ${field}: ${name}`);
      }
      assert.ok(Array.isArray(contract.events) && Array.isArray(contract.knownErrors), `Missing event/error behavior: ${name}`);
      method.contract = contract;
    }
    for (const method of methods.filter((entry) => entry.stability === "stable"))
      assert.ok(method.contract, `Stable method has no core contract: ${method.name}`);
  }
  return { version: 1, methods };
}

