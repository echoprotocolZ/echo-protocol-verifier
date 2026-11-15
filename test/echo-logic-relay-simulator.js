"use strict";
const assert=require("node:assert/strict");
const {RelayNetwork}=require("../scripts/echo-logic/relay-simulator");
const ids=["relay-a","relay-b","relay-c","relay-d","relay-e"];
const opts={threshold:3,total:5,account:"11".repeat(20),destination:"22".repeat(20),chainId:80002,checkpointCommitment:"ab".repeat(32),expiresAt:2000};
const ctx={account:opts.account,destination:opts.destination,chainId:opts.chainId,checkpointCommitment:opts.checkpointCommitment,now:100};
const message=Buffer.from("Echo Logic: multi-relay routing prototype");
describe("Echo Logic multi-node relay simulator",function(){
 it("reconstructs with two offline relays",function(){
  const net=new RelayNetwork(ids),bundle=net.dispatch(message,opts);
  net.setOnline("relay-a",false);net.setOnline("relay-e",false);
  const result=net.receive(bundle,ctx);
  assert.deepEqual(result.payload,message);
  assert.equal(result.relaysUsed.length,3);
 });
 it("fails closed when only two independent fragments arrive",function(){
  const net=new RelayNetwork(ids),bundle=net.dispatch(message,opts,{faults:{"relay-a":{drop:true},"relay-b":{drop:true},"relay-c":{drop:true}}});
  assert.throws(()=>net.receive(bundle,ctx),/Insufficient fragments/);
 });
 it("ignores one corrupted share and reconstructs from the other four",function(){
  const net=new RelayNetwork(ids),bundle=net.dispatch(message,opts,{faults:{"relay-a":{corrupt:true}}});
  const result=net.receive(bundle,ctx);
  assert.deepEqual(result.payload,message);
  assert.equal(result.fragmentsReceived,4);
 });
 it("waits for delayed relays and rejects expired delivery",function(){
  const net=new RelayNetwork(ids),bundle=net.dispatch(message,opts,{start:90,faults:{"relay-a":{delay:100},"relay-b":{delay:100},"relay-c":{delay:100}}});
  assert.throws(()=>net.receive(bundle,{...ctx,now:100}),/Insufficient fragments/);
  assert.deepEqual(net.receive(bundle,{...ctx,now:191}).payload,message);
  const later=new RelayNetwork(ids),late=later.dispatch(message,opts);
  assert.throws(()=>later.receive(late,{...ctx,now:2000}),/Manifest expired/);
 });
 it("rejects replay and cross-account or checkpoint substitution",function(){
  const net=new RelayNetwork(ids),bundle=net.dispatch(message,opts);
  assert.throws(()=>net.receive(bundle,{...ctx,account:"33".repeat(20)}),/Context binding mismatch/);
  assert.throws(()=>net.receive(bundle,{...ctx,checkpointCommitment:"cd".repeat(32)}),/Context binding mismatch/);
  assert.deepEqual(net.receive(bundle,ctx).payload,message);
  assert.throws(()=>net.receive(bundle,ctx),/Replay/);
 });
 it("refuses duplicate node identities and insufficient relays",function(){
  assert.throws(()=>new RelayNetwork(["same","same"]),/Distinct/);
  assert.throws(()=>new RelayNetwork(["a","b"]).dispatch(message,opts),/Not enough/);
 });
});
