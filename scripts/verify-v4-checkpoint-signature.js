const fs = require("fs");
const hre = require("hardhat");
const { loadRecords } = require("./amoy-deployment-records");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function retry(label, fn) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try { return await fn(); } catch (error) {
      if (!/timeout|rate.limit|429|503|free plan|network error/i.test(error.message || "") || attempt === 5) throw error;
      const delay = attempt * 3000;
      console.log("RPC RETRY:", label, "attempt", attempt, "waiting", delay, "ms");
      await sleep(delay);
    }
  }
}


async function main() {
  const r = loadRecords().contracts;
  const bootstrapPath = "deployments/amoy/echo-v4-bootstrapped-account.json";
  if (!fs.existsSync(bootstrapPath)) throw new Error("Missing bootstrapped account deployment record");
  const bootstrap = JSON.parse(fs.readFileSync(bootstrapPath, "utf8"));
  if (bootstrap.chainId !== 80002 || !hre.ethers.isAddress(bootstrap.address) ||
      bootstrap.authorizationBridge.toLowerCase() !== r.EchoAuthorizationBridgeV4.toLowerCase())
    throw new Error("Bootstrapped account record invalid");
  const accountAddress = hre.ethers.getAddress(bootstrap.address);
  const account = await hre.ethers.getContractAt("EchoSmartAccountV4Bootstrapped", accountAddress);
  if ((await retry("account authorizationBridge", () => account.authorizationBridge())).toLowerCase() !== r.EchoAuthorizationBridgeV4.toLowerCase())
    throw new Error("New account bridge mismatch");
  const accountNonce = await retry("account nonce", () => account.nonce());
  const [signer] = await hre.ethers.getSigners();

  const expected =
    "0xbD2dEf17C60C3f6C2dA6eE812F948f4B53f2f803";

  const network = await hre.ethers.provider.getNetwork();

  if (network.chainId !== 80002n) {
    throw new Error("Polygon Amoy required");
  }

  if (signer.address.toLowerCase() !== expected.toLowerCase()) {
    throw new Error("Validator wallet mismatch");
  }

  const dir = "build/v4-geographic-bound/proofs";

  const input = JSON.parse(
    fs.readFileSync(
      `${dir}/v3-amoy-authorization-input.json`,
      "utf8"
    )
  );

  const signals = JSON.parse(
    fs.readFileSync(
      `${dir}/v3-amoy-matching-public.json`,
      "utf8"
    )
  );

  const checkpoint = {
    account: accountAddress,
    delegatee: expected,
    zoneHash:
      "0x779dbc9b263b67e52c604312d097e324ce4c75c90cfa2185d4be0ce5b31fcb76",
    checkpointCommitment: hre.ethers.toBeHex(
      BigInt(signals[18]), 32
    ),
    authorizationCommitment: hre.ethers.toBeHex(
      BigInt(signals[1]), 32
    ),
    timestamp: BigInt(input.checkpointTimestamp),
    nonce: BigInt(input.nonce)
  };

  if (BigInt(checkpoint.nonce) !== accountNonce || BigInt(signals[11]) !== accountNonce) throw new Error("Proof/checkpoint nonce mismatch");
  const registry = new hre.ethers.Contract(
    r.EchoAttestationRegistryV3,
    [
      "function checkpointDigest((address account,address delegatee,bytes32 zoneHash,bytes32 checkpointCommitment,bytes32 authorizationCommitment,uint64 timestamp,uint256 nonce)) view returns (bytes32)"
    ],
    signer
  );

  const digest = await retry("checkpoint digest", () => registry.checkpointDigest(checkpoint));

  // Sign the exact digest expected by the deployed registry.
  // SigningMessage would add an Ethereum prefix, so we use
  // the wallet's signing key to sign this already-typed digest.
  const accounts = hre.network.config.accounts;

  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("Amoy private-key account configuration unavailable");
  }

  const wallet = new hre.ethers.Wallet(accounts[0]);

  if (wallet.address.toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error("Configured wallet does not match validator");
  }

  const signature = wallet.signingKey.sign(digest).serialized;

  const recovered = hre.ethers.recoverAddress(digest, signature);

  console.log("=== STEP 634 CHECKPOINT SIGNATURE ===");
  console.log("Network: Polygon Amoy");
  console.log("Validator:", signer.address);
  console.log("Checkpoint digest:", digest);
  console.log("Recovered signer:", recovered);
  console.log(
    "Signature matches validator:",
    recovered.toLowerCase() === expected.toLowerCase()
  );
  console.log(
    "Signature matches V3 proof:",
    BigInt(recovered) === BigInt(signals[5])
  );

  if (
    recovered.toLowerCase() !== expected.toLowerCase() ||
    BigInt(recovered) !== BigInt(signals[5])
  ) {
    throw new Error("Checkpoint signature verification failed");
  }

  console.log("Checkpoint account:", accountAddress);
  fs.writeFileSync(
    `${dir}/v4-signed-checkpoint.json`,
    JSON.stringify({
      checkpoint: {
        ...checkpoint,
        timestamp: checkpoint.timestamp.toString(),
        nonce: checkpoint.nonce.toString()
      },
      signature
    }, null, 2)
  );

  console.log("Signed checkpoint saved: YES");
  console.log("Transaction broadcast: NO");
  console.log("POL spent: 0");
  console.log("SUCCESS: STEP 634 CHECKPOINT SIGNATURE VERIFIED");
}

main().catch(error => {
  console.error("ERROR:", error.shortMessage || error.message);
  process.exitCode = 1;
});
