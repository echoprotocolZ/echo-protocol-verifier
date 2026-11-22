const assert=require("node:assert/strict");
const fs=require("node:fs");
const snarkjs=require("snarkjs");
const {ethers}=require("hardhat");

// REAL V3/V4 Groth16 verifiers, REAL V3 bridge, REAL V4 policy/gateway,
// REAL dual verifier. The V3 fixture account is impersonated only to set
// the geographic policy in the isolated Hardhat test environment.
describe("Echo real coordinated V3/V4 dual Groth16 verification",function(){
 this.timeout(180000);
 it("accepts both genuine proofs for one signed checkpoint commitment",async function(){
  const base="build/v3-timestamp-fixed";
  const v3proof=JSON.parse(fs.readFileSync(base+"/proof.json","utf8"));
  const v3public=JSON.parse(fs.readFileSync(base+"/public.json","utf8"));
  const input=JSON.parse(fs.readFileSync(base+"/input-local.json","utf8"));
  const v3key=base+"/EchoAuthorizationVerifierV3_final.zkey";
  assert.equal(await snarkjs.groth16.verify(await snarkjs.zKey.exportVerificationKey(v3key),v3public,v3proof),true);
  const {buildPoseidon}=require("circomlibjs");
  const poseidon=await buildPoseidon();
  const commitment=poseidon.F.toString(poseidon([input.checkpointX,input.checkpointY,input.checkpointTimestamp].map(BigInt)));
  assert.equal(BigInt(commitment),BigInt(v3public[18]));
  const zone=[BigInt(input.checkpointX),BigInt(input.checkpointX),BigInt(input.checkpointY),BigInt(input.checkpointY)];
  const v4input={checkpointLat:String(input.checkpointX),checkpointLon:String(input.checkpointY),checkpointTimestamp:String(input.checkpointTimestamp),
   minLat:String(zone[0]),maxLat:String(zone[1]),minLon:String(zone[2]),maxLon:String(zone[3]),expectedCheckpointCommitment:commitment};
  const v4base="build/v4-geographic-bound";
  const wasm=v4base+"/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm";
  const zkey=v4base+"/setup/EchoGeographicBoundV4_final.zkey";
  const {proof:v4proof,publicSignals:v4public}=await snarkjs.groth16.fullProve(v4input,wasm,zkey);
  assert.equal(await snarkjs.groth16.verify(await snarkjs.zKey.exportVerificationKey(zkey),v4public,v4proof),true);
  assert.equal(BigInt(v4public[4]),BigInt(v3public[18]));
  async function deploy(name,...args){
   const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;
  }
  const registry=await deploy("EchoAttestationRegistryV3");
  const v3verifier=await deploy("EchoAuthorizationVerifierV3");
  const v3bridge=await deploy("EchoAuthorizationBridgeV3",v3verifier.target,registry.target);
  const policy=await deploy("EchoGeographicPolicyRegistryV4");
  const v4verifier=await deploy("EchoGeographicBoundVerifierV4");
  const gateway=await deploy("EchoGeographicProofGatewayV4",v4verifier.target,policy.target);
  const dual=await deploy("EchoDualProofVerifierV4",v3bridge.target,gateway.target);
  const account=ethers.getAddress(ethers.toBeHex(BigInt(v3public[3]),20));
  const delegatee=ethers.getAddress(ethers.toBeHex(BigInt(v3public[4]),20));
  const signer=await ethers.getImpersonatedSigner(account);
  await ethers.provider.send("hardhat_setBalance",[account,ethers.toBeHex(ethers.parseEther("1"))]);
  await(await policy.connect(signer).setGeographicPolicy(delegatee,zone)).wait();
  const zoneHash=(await policy.getGeographicPolicy(account,delegatee)).zoneHash;
  const cp={account,delegatee,zoneHash,
   checkpointCommitment:ethers.toBeHex(BigInt(v3public[18]),32),
   authorizationCommitment:ethers.toBeHex(BigInt(v3public[1]),32),
   timestamp:BigInt(v3public[19]),nonce:BigInt(v3public[11])};
  const v3call=JSON.parse("["+await snarkjs.groth16.exportSolidityCallData(v3proof,v3public)+"]");
  const v4call=JSON.parse("["+await snarkjs.groth16.exportSolidityCallData(v4proof,v4public)+"]");
  assert.equal(await dual.verifyDualProof(cp,...v3call,...v4call),true);
  await(await policy.connect(signer).disableGeographicPolicy(delegatee)).wait();
  await assert.rejects(async()=>dual.verifyDualProof(cp,...v3call,...v4call),
   "Disabled geographic policy must block real dual proof verification");
 });
});
