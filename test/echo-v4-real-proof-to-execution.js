const assert=require("node:assert/strict");
const fs=require("node:fs");
const snarkjs=require("snarkjs");
const {buildPoseidon}=require("circomlibjs");
const {ethers}=require("hardhat");

// Genuine V3 + V4 proofs and production bridge/account/registry contracts.
// Hardhat impersonation is ONLY used to initialize account-scoped policies:
// production smart-account policy administration is intentionally disabled.
describe("Echo real proof-to-account execution",function(){
 this.timeout(180000);
 for(const mode of ["success","rollback","invalid-signature","untrusted-validator","unauthorized-caller","tampered-target","tampered-value","tampered-calldata","expired-authorization","revoked-geographic-policy","revoked-attestation-policy"]) it(({success:"executes a validator-signed dual-proof authorization once and rejects replay",rollback:"rolls back checkpoint, nullifier and nonce when target reverts","invalid-signature":"rejects a forged validator signature with real proofs","untrusted-validator":"rejects an untrusted validator with real proofs","unauthorized-caller":"rejects an unauthorized caller with real proofs","tampered-target":"rejects transaction target tampering with real proofs","tampered-value":"rejects ETH value tampering with real proofs","tampered-calldata":"rejects calldata tampering with real proofs","expired-authorization":"rejects expired authorization with real proofs","revoked-geographic-policy":"rejects revoked geographic policy with real proofs","revoked-attestation-policy":"rejects revoked attestation policy with real proofs"})[mode],async function(){
  const shouldRevert=mode==="rollback";
  async function deploy(name,...args){const c=await(await ethers.getContractFactory(name)).deploy(...args);await c.waitForDeployment();return c;}
  const [owner,validator,target]=await ethers.getSigners();
  const registry=await deploy("EchoAttestationRegistryV3");
  const v3verifier=await deploy("EchoAuthorizationVerifierV3");
  // Empty calldata to the real V3 verifier reverts: it has no fallback.
  const destination=shouldRevert ? v3verifier.target : target.address;
  const v3bridge=await deploy("EchoAuthorizationBridgeV3",v3verifier.target,registry.target);
  const policy=await deploy("EchoGeographicPolicyRegistryV4");
  const v4verifier=await deploy("EchoGeographicBoundVerifierV4");
  const gateway=await deploy("EchoGeographicProofGatewayV4",v4verifier.target,policy.target);
  const dual=await deploy("EchoDualProofVerifierV4",v3bridge.target,gateway.target);
  const bridge=await deploy("EchoAuthorizationBridgeV4",dual.target,registry.target);
  const account=await deploy("EchoSmartAccountV4",owner.address,ethers.ZeroAddress,bridge.target);
  const accountSigner=await ethers.getImpersonatedSigner(account.target);
  await ethers.provider.send("hardhat_setBalance",[account.target,ethers.toBeHex(ethers.parseEther("1"))]);
  const zone=[100050n,100050n,200000n,200000n];
  await(await policy.connect(accountSigner).setGeographicPolicy(account.target,zone)).wait();
  const zoneHash=(await policy.getGeographicPolicy(account.target,account.target)).zoneHash;
  await(await registry.connect(accountSigner).setCheckpointBridge(bridge.target,true)).wait();
  await(await registry.connect(accountSigner).setValidatorSigner(validator.address,true)).wait();
  await(await registry.connect(accountSigner).setAttestationPolicy(account.target,{
   allowedZoneHash:zoneHash,maxTimeDrift:3600n,requiredTier:0,allowValidatorFallback:false,enabled:true
  })).wait();
  const base="build/v3-timestamp-fixed";
  const input=JSON.parse(fs.readFileSync(base+"/input-local.json","utf8"));
  const poseidon=await buildPoseidon();
  const hash=(...args)=>poseidon.F.toString(poseidon(args.map(BigInt)));
  const now=BigInt((await ethers.provider.getBlock("latest")).timestamp);
  const network=await ethers.provider.getNetwork();
  const callData="0x",dataHash=BigInt(ethers.keccak256(callData));
  Object.assign(input,{
   account:BigInt(account.target).toString(),delegatee:BigInt(account.target).toString(),
   validator:BigInt(validator.address).toString(),target:BigInt(destination).toString(),
   value:"0",calldataHashLow:(dataHash&((1n<<128n)-1n)).toString(),
   calldataHashHigh:(dataHash>>128n).toString(),chainId:network.chainId.toString(),
   nonce:"0",deadline:(now+3600n).toString(),checkpointX:"100050",checkpointY:"200000",
   checkpointTimestamp:now.toString(),expectedCheckpointTimestamp:now.toString(),targetX:"100050",targetY:"200000",
   minTimestamp:now.toString(),maxTimestamp:now.toString()
  });
  input.expectedFragmentCommitment=hash(input.fragmentPayload,input.fragmentSalt);
  input.expectedCheckpointCommitment=hash(input.checkpointX,input.checkpointY,input.checkpointTimestamp);
  const auth1=hash(input.account,input.delegatee,input.validator,input.target,input.value,
   input.calldataHashLow,input.calldataHashHigh,input.chainId,input.nonce,input.deadline,
   input.expectedFragmentCommitment,input.targetX,input.targetY,input.maxDistanceSq,
   input.minTimestamp,input.maxTimestamp);
  input.expectedAuthorizationCommitment=hash(auth1,input.expectedCheckpointCommitment);
  input.expectedNullifier=hash(input.account,input.expectedAuthorizationCommitment);
  const v3=await snarkjs.groth16.fullProve(input,
   base+"/EchoAuthorizationVerifierV3_js/EchoAuthorizationVerifierV3.wasm",
   base+"/EchoAuthorizationVerifierV3_final.zkey");
  assert.equal(await snarkjs.groth16.verify(
   await snarkjs.zKey.exportVerificationKey(base+"/EchoAuthorizationVerifierV3_final.zkey"),
   v3.publicSignals,v3.proof),true);
  const v4base="build/v4-geographic-bound";
  const v4=await snarkjs.groth16.fullProve({
   checkpointLat:input.checkpointX,checkpointLon:input.checkpointY,
   checkpointTimestamp:input.checkpointTimestamp,minLat:"100050",maxLat:"100050",
   minLon:"200000",maxLon:"200000",
   expectedCheckpointCommitment:input.expectedCheckpointCommitment
  },v4base+"/EchoGeographicBoundV4_js/EchoGeographicBoundV4.wasm",
   v4base+"/setup/EchoGeographicBoundV4_final.zkey");
  assert.equal(await snarkjs.groth16.verify(
   await snarkjs.zKey.exportVerificationKey(v4base+"/setup/EchoGeographicBoundV4_final.zkey"),
   v4.publicSignals,v4.proof),true);
  const v3args=JSON.parse("["+await snarkjs.groth16.exportSolidityCallData(v3.proof,v3.publicSignals)+"]");
  const v4args=JSON.parse("["+await snarkjs.groth16.exportSolidityCallData(v4.proof,v4.publicSignals)+"]");
  const cp={account:account.target,delegatee:account.target,zoneHash,
   checkpointCommitment:ethers.toBeHex(BigInt(input.expectedCheckpointCommitment),32),
   authorizationCommitment:ethers.toBeHex(BigInt(input.expectedAuthorizationCommitment),32),
   timestamp:now,nonce:0n};
  const domain={name:"EchoAttestationRegistryV3",version:"1",
   chainId:network.chainId,verifyingContract:registry.target};
  const types={SignedCheckpoint:[
   {name:"account",type:"address"},{name:"delegatee",type:"address"},
   {name:"zoneHash",type:"bytes32"},{name:"checkpointCommitment",type:"bytes32"},
   {name:"authorizationCommitment",type:"bytes32"},{name:"timestamp",type:"uint64"},
   {name:"nonce",type:"uint256"}]};
  const signature=await validator.signTypedData(domain,types,cp);
  assert.equal(await dual.verifyDualProof(cp,...v3args,...v4args),true);
  if(mode==="expired-authorization"){
   // The circuit deadline is now+3600; advance the chain beyond it.
   await ethers.provider.send("evm_setNextBlockTimestamp",[Number(now+3601n)]);
   await ethers.provider.send("evm_mine",[]);
  }
  if(mode==="revoked-geographic-policy") await(await policy.connect(accountSigner).disableGeographicPolicy(account.target)).wait();
  if(mode==="revoked-attestation-policy") await(await registry.connect(accountSigner).setAttestationPolicy(account.target,{
   allowedZoneHash:zoneHash,maxTimeDrift:3600n,requiredTier:0,allowValidatorFallback:false,enabled:false
  })).wait();
  const signatureToUse=mode==="invalid-signature" ? await target.signTypedData(domain,types,cp) : signature;
  if(mode==="untrusted-validator") await(await registry.connect(accountSigner).setValidatorSigner(validator.address,false)).wait();
  const caller=mode==="unauthorized-caller" ? target : owner;
  const executionTarget=mode==="tampered-target" ? validator.address : destination;
  const executionValue=mode==="tampered-value" ? 1n : 0n;
  const executionData=mode==="tampered-calldata" ? "0x12345678" : callData;
  const execute=()=>account.connect(caller).executeAuthorized(cp,signatureToUse,
   ...v3args,...v4args,executionTarget,executionValue,executionData);
  if(!["success","rollback"].includes(mode)){
   await assert.rejects(async()=>{const tx=await execute();await tx.wait();},mode+" must reject");
   assert.equal(await account.nonce(),0n,"Rejected authorization cannot advance account nonce");
   assert.equal(await bridge.consumedNullifiers(BigInt(input.expectedNullifier)),false,"Rejected authorization cannot consume nullifier");
   assert.equal(await registry.consumedCheckpoints(await registry.checkpointDigest(cp)),false,"Rejected authorization cannot consume checkpoint");
   assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,0n),false,"Rejected authorization cannot consume checkpoint nonce");
  }else if(shouldRevert){
   await assert.rejects(async()=>{const tx=await execute();await tx.wait();},"Reverting target must reject execution");
   assert.equal(await account.nonce(),0n,"Account nonce must roll back");
   assert.equal(await bridge.consumedNullifiers(BigInt(input.expectedNullifier)),false,"Nullifier must roll back");
   assert.equal(await registry.consumedCheckpoints(await registry.checkpointDigest(cp)),false,"Checkpoint must roll back");
   assert.equal(await registry.consumedCheckpointNonces(account.target,account.target,0n),false,"Registry nonce must roll back");
  }else{
   await(await execute()).wait();
   assert.equal(await account.nonce(),1n);
   assert.equal(await bridge.consumedNullifiers(BigInt(input.expectedNullifier)),true);
   assert.equal(await registry.consumedCheckpoints(await registry.checkpointDigest(cp)),true);
   await assert.rejects(execute,"Replay must revert");
   assert.equal(await account.nonce(),1n);
  }
 });
});
