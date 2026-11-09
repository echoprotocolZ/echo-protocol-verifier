const assert = require("node:assert/strict");
const fs = require("node:fs");

describe("Echo Z AI registry bypass protection", function () {
  it("explicitly blocks direct policy registry execution", function () {
    const source = fs.readFileSync(
      "contracts/EchoSmartAccountZ.sol",
      "utf8"
    );

    const start = source.indexOf(
      "function _validateExecutionPolicy("
    );

    assert.notEqual(start, -1, "Policy validation hook missing");

    const end = source.indexOf(
      "agentPolicyRegistry.staticcall(",
      start
    );

    assert.notEqual(end, -1, "Registry validation call missing");

    const guard = source.slice(start, end);

    assert.match(
      guard,
      /if\s*\(\s*target\s*==\s*agentPolicyRegistry\s*\)\s*revert\s+Unauthorized\(\);/,
      "Direct policy registry execution must be forbidden"
    );
  });
});
