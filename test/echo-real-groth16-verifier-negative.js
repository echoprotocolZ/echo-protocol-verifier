const assert=require("node:assert/strict");
const {ethers}=require("hardhat");

// Deploys the ACTUAL snarkjs-generated Groth16 verifier contracts.
// Invalid zero proofs must not be accepted. No verifier mocks are used.
describe("Echo real Groth16 verifier contracts — invalid proof rejection",function(){
 const a=[0n,0n],b=[[0n,0n],[0n,0n]],c=[0n,0n];
 async function deploy(name){
  const contract=await(await ethers.getContractFactory(name)).deploy();
  await contract.waitForDeployment();return contract;
 }
 it("rejects zero Groth16 proof against real V3 verifier",async function(){
  const verifier=await deploy("EchoAuthorizationVerifierV3");
  assert.equal(await verifier.verifyProof(a,b,c,Array(20).fill(0n)),false);
 });
 it("rejects zero Groth16 proof against real V4 geographic verifier",async function(){
  const verifier=await deploy("EchoGeographicBoundVerifierV4");
  assert.equal(await verifier.verifyProof(a,b,c,Array(5).fill(0n)),false);
 });
 it("rejects V3 public signal outside BN254 scalar field",async function(){
  const verifier=await deploy("EchoAuthorizationVerifierV3");
  const signals=Array(20).fill(0n);
  signals[0]=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  assert.equal(await verifier.verifyProof(a,b,c,signals),false);
 });
 it("rejects V4 public signal outside BN254 scalar field",async function(){
  const verifier=await deploy("EchoGeographicBoundVerifierV4");
  const signals=Array(5).fill(0n);
  signals[0]=21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  assert.equal(await verifier.verifyProof(a,b,c,signals),false);
 });
});
