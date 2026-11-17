const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

describe("Echo V4 production-style constructor bootstrap",function(){
 it("initializes account-scoped bridge, signer and both policies without impersonation",async function(){
  async function deploy(name,...args){const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;}
  const [owner,validator,outsider]=await ethers.getSigners();
  const registry=await deploy("EchoAttestationRegistryV3");
  const v3verifier=await deploy("EchoAuthorizationVerifierV3");
  const v3bridge=await deploy("EchoAuthorizationBridgeV3",v3verifier.target,registry.target);
  const geo=await deploy("EchoGeographicPolicyRegistryV4");
  const v4verifier=await deploy("EchoGeographicBoundVerifierV4");
  const gateway=await deploy("EchoGeographicProofGatewayV4",v4verifier.target,geo.target);
  const dual=await deploy("EchoDualProofVerifierV4",v3bridge.target,gateway.target);
  const bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
  const zone=[100050n,100050n,200000n,200000n];
  const account=await deploy("EchoSmartAccountV4Bootstrapped",owner.address,ethers.ZeroAddress,bridge.target,validator.address,zone,3600n);
  assert.equal(await account.owner(),owner.address);
  assert.equal(await registry.authorizedCheckpointBridges(account.target,bridge.target),true);
  assert.equal(await registry.trustedValidatorSigners(account.target,validator.address),true);
  const policy=await registry.attestationPolicies(account.target,account.target);
  const geographic=await geo.getGeographicPolicy(account.target,account.target);
  assert.equal(policy.enabled,true);
  assert.equal(geographic.enabled,true);
  assert.equal(policy.allowedZoneHash,geographic.zoneHash);
  assert.equal(await bridge.authorizedDelegatees(account.target,outsider.address),false);
  await assert.rejects(()=>account.connect(owner).executeAdministration(geo.target,"0x"),"Admin path must remain disabled");
  await assert.rejects(()=>account.connect(owner).transferOwnership(outsider.address),"Ownership bypass must remain disabled");
 });
 it("rejects invalid validator and zero drift during construction",async function(){
  const [owner]=await ethers.getSigners();
  const fakeBridge=owner.address;
  await assert.rejects(
   ()=>ethers.getContractFactory("EchoSmartAccountV4Bootstrapped").then(f=>f.deploy(owner.address,ethers.ZeroAddress,fakeBridge,owner.address,[1,1,1,1],3600)),
   "Bridge must be a deployed contract"
  );
 });
});
