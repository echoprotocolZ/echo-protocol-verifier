"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("ECHO real-proof CI isolation boundary (static)", function () {
  const workflow = fs.readFileSync(path.join(".github", "workflows", "v4-security-regression.yml"), "utf8");
  const proofFiles = [
    "test/echo-v4-atomic-rollback-retry.js",
    "test/echo-v4-execution-atomic-rollback.js",
    "test/echo-v4-real-dual-proof-integration.js"
  ];
  it("keeps proof-dependent tests out of artifact-independent selection", function () {
    const manifest = JSON.parse(fs.readFileSync("ci/artifact-dependent-test-manifest.json", "utf8"));
    for (const file of proofFiles) {
      assert.ok(fs.existsSync(file), `Missing proof-dependent test: ${file}`);
      assert.ok(manifest.excluded_files.includes(file), `Proof-dependent test not excluded: ${file}`);
    }
  });
  it("does not expose the encrypted artifact secret to pull-request jobs", function () {
    const diagnostic = workflow.split(/^  full-suite-diagnostic:/m)[1];
    assert.ok(diagnostic, "Full-suite diagnostic job missing");
    assert.match(diagnostic, /github\.event_name != 'pull_request'/);
    assert.match(diagnostic, /ECHO_CI_ARTIFACT_KEY/);
    const otherJobs = workflow.split(/^  full-suite-diagnostic:/m)[0];
    assert.doesNotMatch(otherJobs, /secrets\.ECHO_CI_ARTIFACT_KEY/);
  });
  it("does not claim a V4 circuit compile is a real Groth16 proof", function () {
    assert.match(workflow, /A successful build is NOT evidence of a valid Groth16 proof/);
    assert.match(workflow, /no proof generated/);
  });
});
