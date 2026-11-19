const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

// Official Safe singleton and proxy factory from @safe-global/safe-contracts.
// This test must never connect to a live chain.
describe("Echo bootstrap official Safe 2-of-2 EIP-1271 integration", function () {
  it("accepts two owner signatures and rejects one or modified approval", async function () {
    const [ownerA, ownerB, outsider, replacement] = await ethers.getSigners();
    const artifact = name => {
      const paths = {
        Safe: "Safe.sol",
        SafeProxyFactory: "proxies/SafeProxyFactory.sol",
        CompatibilityFallbackHandler: "handler/CompatibilityFallbackHandler.sol"
      };
      return require(`@safe-global/safe-contracts/build/artifacts/contracts/${paths[name]}/${name}.json`);
    };
    const officialFactory = (name, signer) => new ethers.ContractFactory(artifact(name).abi, artifact(name).bytecode, signer);
    const Safe = officialFactory("Safe", ownerA);
    const singleton = await Safe.deploy();
    const ProxyFactory = officialFactory("SafeProxyFactory", ownerA);
    const fallbackHandler = await officialFactory("CompatibilityFallbackHandler", ownerA).deploy();
    const proxyFactory = await ProxyFactory.deploy();
    const setup = Safe.interface.encodeFunctionData("setup", [
      [ownerA.address, ownerB.address], 2, ethers.ZeroAddress, "0x",
      await fallbackHandler.getAddress(), ethers.ZeroAddress, 0, ethers.ZeroAddress
    ]);
    const tx = await proxyFactory.createProxyWithNonce(await singleton.getAddress(), setup, 12345);
    const receipt = await tx.wait();
    const event = receipt.logs.map(log => {
      try { return proxyFactory.interface.parseLog(log); } catch { return null; }
    }).find(log => log?.name === "ProxyCreation");
    assert(event, "Safe proxy creation event missing");
    const safe = Safe.attach(event.args.proxy);
    const safe1271 = new ethers.Contract(event.args.proxy, artifact("CompatibilityFallbackHandler").abi, ownerA);
    assert.equal(await safe.getThreshold(), 2n);
    const registry = await (await ethers.getContractFactory("EchoAttestationRegistryV3")).deploy();
    const verifier = await (await ethers.getContractFactory("EchoBootstrapVerifierStub")).deploy(false);
    const factory = await (await ethers.getContractFactory("EchoBootstrapSafeApprovedFactoryV1")).deploy(await safe.getAddress());
    const root = 123456n, salt = ethers.id("official-safe-local-2of2");
    const registryAddress = await registry.getAddress(), verifierAddress = await verifier.getAddress();
    const digest = await factory.approvalDigest(registryAddress, verifierAddress, root, salt);
    // Safe's EIP-1271 bytes32 variant checks the signed hash of its EIP-712 message.
    const safeMessageHash = await safe1271.getMessageHash(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [digest]));
    const signatures = await Promise.all([ownerA, ownerB].map(async signer => {
      const sig = ethers.Signature.from(await signer.signMessage(ethers.getBytes(safeMessageHash)));
      return { address: signer.address.toLowerCase(), bytes: ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v + 4, 1)]) };
    }));
    signatures.sort((a, b) => a.address.localeCompare(b.address));
    const both = ethers.concat(signatures.map(s => s.bytes));
    const deploy = sig => factory.connect(outsider).deployApprovedPair(registryAddress, verifierAddress, root, salt, sig);
    await assert.rejects(deploy(signatures[0].bytes), "single owner signature must fail");
    await assert.rejects(factory.connect(outsider).deployApprovedPair(registryAddress, verifierAddress, root + 1n, salt, both), "modified root must fail");
    const wrong = ethers.Signature.from(await replacement.signMessage(ethers.getBytes(safeMessageHash)));
    const substituted = [signatures[0], {
      address: replacement.address.toLowerCase(),
      bytes: ethers.concat([wrong.r, wrong.s, ethers.toBeHex(wrong.v + 4, 1)])
    }].sort((a, b) => a.address.localeCompare(b.address));
    await assert.rejects(deploy(ethers.concat(substituted.map(s => s.bytes))), "non-owner signature must fail");
    await assert.rejects(deploy(ethers.concat([signatures[0].bytes, signatures[0].bytes])), "duplicate owner must fail");
    await assert.rejects(deploy("0x"), "empty signature must fail");
    await assert.rejects(factory.connect(outsider).deployApprovedPair(
      registryAddress, verifierAddress, root, ethers.id("altered-safe-salt"), both
    ), "altered salt must fail");
    const alternateVerifier = await (await ethers.getContractFactory("EchoBootstrapVerifierStub")).deploy(false);
    await assert.rejects(factory.connect(outsider).deployApprovedPair(
      registryAddress, await alternateVerifier.getAddress(), root, salt, both
    ), "altered verifier must fail");
    assert.equal(await factory.deployed(), false, "failed authorizations must not deploy");
    // Local-only state-transition harness: impersonation simulates an already-authorized
    // Safe self-call. This does NOT test Safe execTransaction signature authorization.
    await network.provider.request({ method: "hardhat_impersonateAccount", params: [await safe.getAddress()] });
    await network.provider.send("hardhat_setBalance", [await safe.getAddress(), "0x56BC75E2D63100000"]);
    const safeSelf = await ethers.getSigner(await safe.getAddress());
    await (await safe.connect(safeSelf).changeThreshold(1)).wait();
    assert.equal(await safe.getThreshold(), 1n);
    await assert.rejects(deploy(both), "threshold downgrade must invalidate approval");
    assert.equal(await factory.deployed(), false);
    await (await safe.connect(safeSelf).changeThreshold(2)).wait();
    const originalOwners = await safe.getOwners();
    const ownerToReplace = originalOwners[0];
    // Safe owners form a linked list: the first owner follows sentinel address(0x1).
    const prevOwner = "0x0000000000000000000000000000000000000001";
    await (await safe.connect(safeSelf).swapOwner(prevOwner, ownerToReplace, replacement.address)).wait();
    await assert.rejects(deploy(both), "owner replacement must invalidate approval");
    assert.equal(await factory.deployed(), false);
    await (await safe.connect(safeSelf).swapOwner(prevOwner, replacement.address, ownerToReplace)).wait();
    await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [await safe.getAddress()] });
    await (await deploy(both)).wait();
    assert.equal(await factory.deployed(), true);
    await assert.rejects(deploy(both), "replay after deployment must fail");
  });
});
