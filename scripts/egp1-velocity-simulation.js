"use strict";
// EGP-1 off-chain policy simulation. No cryptographic proof, clock, or enclave verification.
// Coordinates are latitude/longitude scaled by 1e6; haversine distance is for simulation only.
const assert = require("node:assert/strict");
const EARTH_RADIUS_KM = 6371.0088;
function distanceKm(a, b) {
  for (const p of [a,b]) {
    if (!Number.isSafeInteger(p.x) || !Number.isSafeInteger(p.y) ||
        Math.abs(p.x) > 90000000 || Math.abs(p.y) > 180000000) throw Error("INVALID_COORDS");
  }
  const lat1 = a.x / 1e6 * Math.PI / 180, lat2 = b.x / 1e6 * Math.PI / 180;
  const dLat = lat2 - lat1, dLon = (b.y - a.y) / 1e6 * Math.PI / 180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, h)));
}
function evaluate(shard, policy) {
  const reject = (reason) => ({accepted:false,reason});
  const vector = shard.spatiotemporal_vector;
  const origin = vector.origin_checkpoint, target = vector.target_checkpoint;
  const window = target.time_window, velocity = vector.velocity_constraints;
  const time = shard.observed_arrival_utc_ms;
  if (!Number.isSafeInteger(time) || !Number.isSafeInteger(origin.t_departure_utc_ms) ||
      !Number.isSafeInteger(window.t_start_ms) || !Number.isSafeInteger(window.t_end_ms) ||
      !Number.isSafeInteger(window.max_drift_ms)) return reject("INVALID_TIME");
  if (window.max_drift_ms < 0 || window.max_drift_ms > 500 ||
      !Number.isSafeInteger(shard.measured_clock_drift_ms) ||
      Math.abs(shard.measured_clock_drift_ms) > window.max_drift_ms) return reject("CLOCK_DRIFT");
  if (!Number.isSafeInteger(policy.environment_tolerance_ms) ||
      policy.environment_tolerance_ms < 0 || policy.environment_tolerance_ms > policy.max_environment_tolerance_ms) return reject("INVALID_POLICY");
  if (window.t_end_ms < window.t_start_ms) return reject("INVALID_WINDOW");
  const elapsedMs = time - origin.t_departure_utc_ms;
  if (elapsedMs <= 0) return reject("INVALID_ELAPSED_TIME");
  const distance = distanceKm(origin.scaled_coords,target.scaled_coords);
  const speed = distance * 1000 / elapsedMs;
  if (velocity.medium !== policy.medium ||
      !Number.isFinite(velocity.v_min_km_s) || !Number.isFinite(velocity.v_max_km_s) ||
      velocity.v_min_km_s < 0 || velocity.v_max_km_s < velocity.v_min_km_s ||
      velocity.v_max_km_s > policy.absolute_max_km_s) return reject("INVALID_VELOCITY_POLICY");
  if (time < window.t_start_ms - policy.environment_tolerance_ms - window.max_drift_ms ||
      time > window.t_end_ms + policy.environment_tolerance_ms + window.max_drift_ms) return reject("WINDOW_EXPIRED");
  if (speed > velocity.v_max_km_s) return reject("VELOCITY_EXCEEDED");
  if (speed < velocity.v_min_km_s) return reject("VELOCITY_BELOW_MINIMUM");
  return {accepted:true,reason:"POLICY_CHECKS_PASSED_ONLY",distance_km:distance,velocity_km_s:speed};
}
const origin={x:40712800,y:-74006000}, target={x:40758000,y:-73985500};
const baseTime=1765429000128;
const base={
  protocol_version:"ECHO_PROTOCOL_V3",egp_standard:"EGP-1",
  spatiotemporal_vector:{
    origin_checkpoint:{scaled_coords:origin,t_departure_utc_ms:baseTime},
    target_checkpoint:{scaled_coords:target,time_window:{t_start_ms:baseTime+100,t_end_ms:baseTime+1000,max_drift_ms:500}},
    velocity_constraints:{medium:"FIBER_OPTIC",v_min_km_s:0,v_max_km_s:200000}
  },
  observed_arrival_utc_ms:baseTime+500,measured_clock_drift_ms:10
};
const policy={medium:"FIBER_OPTIC",environment_tolerance_ms:100,max_environment_tolerance_ms:1000,absolute_max_km_s:200000};
const copy=()=>structuredClone(base);
const cases=[
  ["valid",x=>x,true,"POLICY_CHECKS_PASSED_ONLY"],
  ["too_fast",x=>{x.observed_arrival_utc_ms=baseTime+1;x.spatiotemporal_vector.velocity_constraints.v_max_km_s=1;return x},false,"VELOCITY_EXCEEDED"],
  ["too_slow",x=>{x.spatiotemporal_vector.velocity_constraints.v_min_km_s=100;return x},false,"VELOCITY_BELOW_MINIMUM"],
  ["late",x=>{x.observed_arrival_utc_ms=baseTime+3000;return x},false,"WINDOW_EXPIRED"],
  ["clock_drift",x=>{x.measured_clock_drift_ms=501;return x},false,"CLOCK_DRIFT"],
  ["invalid_coords",x=>{x.spatiotemporal_vector.origin_checkpoint.scaled_coords.x=91000000;return x},null,"INVALID_COORDS"]
];
for(const [name,modify,expected,reason] of cases){
  let result;
  try { result=evaluate(modify(copy()),policy); } catch(e){result={accepted:null,reason:e.message};}
  assert.equal(result.accepted,expected,name);
  assert.equal(result.reason,reason,name);
  console.log(name,result.reason);
}
console.log("All EGP-1 policy simulations passed; NO cryptographic verification or slashing performed.");
