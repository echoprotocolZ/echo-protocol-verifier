const { expect } = require("chai");
const fs = require("fs");

describe("ECHO V3 checkpoint timestamp binding", function () {
  it("requires the signed timestamp to be bound to the proof timestamp", function () {
    const circuit = fs.readFileSync(
      "EchoAuthorizationVerifierV3.circom", "utf8"
    );

    const bridge = fs.readFileSync(
      "contracts/EchoAuthorizationBridgeV3.sol", "utf8"
    );

    const publicTimestamp =
      /signal\s+input\s+expectedCheckpointTimestamp\s*;/.test(circuit) &&
      /checkpointTimestamp\s*===\s*expectedCheckpointTimestamp\s*;/.test(circuit);

    const bridgeBinding =
      /(?:uint256\(\s*checkpoint\.timestamp\s*\)|checkpoint\.timestamp)\s*!=\s*signals\[\d+\]/.test(bridge);

    expect(
      publicTimestamp && bridgeBinding,
      "Signed checkpoint timestamp is not explicitly bound to the proof timestamp"
    ).to.equal(true);
  });
});
