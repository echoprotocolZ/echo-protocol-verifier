const { generateProof } = require("./echo-proof-generator");

async function generateDualProof(v3Input, v4Input) {
  const [v3, v4] = await Promise.all([
    generateProof("v3", v3Input),
    generateProof("v4", v4Input)
  ]);

  return {
    v3A: v3.solidity.a,
    v3B: v3.solidity.b,
    v3C: v3.solidity.c,
    v3Signals: v3.solidity.signals,
    v4A: v4.solidity.a,
    v4B: v4.solidity.b,
    v4C: v4.solidity.c,
    v4Signals: v4.solidity.signals
  };
}

module.exports = { generateDualProof };
