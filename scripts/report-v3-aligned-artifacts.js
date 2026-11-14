// Produces reviewable SHA-256 provenance for the candidate V3 circuit build.
// This does not attest to trusted setup or establish production readiness.
const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const root = "build/v3-aligned";
const files = [
  "EchoAuthorizationVerifierV3Aligned.r1cs",
  "EchoAuthorizationVerifierV3Aligned.sym",
  "EchoAuthorizationVerifierV3Aligned_js/EchoAuthorizationVerifierV3Aligned.wasm",
];
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const manifest = {
  status: "CANDIDATE_ONLY_NOT_A_TRUSTED_SETUP",
  source: "EchoAuthorizationVerifierV3Aligned.circom",
  sourceSha256: sha("EchoAuthorizationVerifierV3Aligned.circom"),
  publicSignalCount: 20,
  artifacts: files.map(f => {
    const p = path.join(root, f);
    if (!fs.statSync(p).size) throw Error("Empty artifact: " + p);
    return { path: p, sha256: sha(p) };
  }),
};
fs.writeFileSync(path.join(root, "artifact-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify(manifest, null, 2));
