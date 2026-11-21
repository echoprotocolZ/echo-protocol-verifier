"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("ECHO real-proof CI isolation boundary (static)", function () {
  const workflow = fs.readFileSync(path.join(".github", "workflows", "v4-security-regression.yml"), "utf8");
  const proofFiles = [
    "test/echo-v4-atomic-rollback-retry.js",
    "test/echo-v4-execution-atomic-rollback.js",
    "test/echo-v4-real-" + "dual-proof-integration.js"
  ];
  it("keeps proof-dependent tests out of artifact-independent selection", function () {
    const manifest = JSON.parse(fs.readFileSync("ci/artifact-dependent-test-manifest.json", "utf8"));
    for (const file of proofFiles) {
      assert.ok(fs.existsSync(file), `Missing proof-dependent test: ${file}`);
      assert.ok(manifest.excluded_files.includes(file), `Proof-dependent test not excluded: ${file}`);
    }
  });
  it("does not expose proving-artifact secrets to pull-request jobs", function () {
    const jobSections = workflow.split(/^  (?=[a-z][a-z0-9-]*:)/m).slice(1);
    const secretJobs = jobSections.filter(section => section.includes("secrets.ECHO_CI_ARTIFACT_KEY"));
    assert.equal(secretJobs.length, 2, "Expected exactly two protected secret-consuming jobs");
    for (const section of secretJobs) {
      const header = section.split("\n", 1)[0].trim();
      assert.ok(
        header === "full-suite-diagnostic:" || header === "trusted-real-proof-rollback:",
        "Secret exposed in unexpected job: " + header
      );
      const condition = section.split("\n").find(line => line.trim().startsWith("if:"));
      assert.ok(condition, "Secret-consuming job must have an explicit gate");
      assert.ok(condition.includes("github.ref == 'refs/heads/security/v4-zero-trust-hardening'"));
      if (header === "trusted-real-proof-rollback:") {
        assert.ok(condition.includes("github.event_name == 'workflow_dispatch'"));
      } else {
        assert.ok(condition.includes("github.event_name != 'pull_request'"));
      }
    }
  });
  it("gates the new secret-backed job to trusted manual dispatch only", function () {
    const marker = "  trusted-real-proof-rollback:";
    assert.ok(workflow.includes(marker), "Trusted real-proof job missing");
    const job = workflow.split(marker)[1];
    const condition = job.split("\n").find(line => line.trim().startsWith("if:"));
    assert.ok(condition);
    assert.ok(condition.includes("github.event_name == 'workflow_dispatch'"));
    assert.ok(condition.includes("github.ref == 'refs/heads/security/v4-zero-trust-hardening'"));
    assert.ok(job.includes("persist-credentials: false"));
    assert.ok(job.includes("ECHO_CI_ARTIFACT_KEY"));
    assert.ok(job.includes("test/echo-v4-execution-atomic-rollback.js"));
    assert.ok(job.includes("test/echo-v4-atomic-rollback-retry.js"));
  });
  it("requires digest pinning and bounded extraction in both protected jobs", function () {
    const secretJobs = workflow.split(/^  (?=[a-z][a-z0-9-]*:)/m).slice(1)
      .filter(section => section.includes("secrets.ECHO_CI_ARTIFACT_KEY"));
    assert.equal(secretJobs.length, 2);
    for (const job of secretJobs) {
      assert.ok(job.includes("secrets.ECHO_CI_ARTIFACT_SHA256"), "Missing trusted digest secret");
      assert.ok(job.includes("sha256sum --check --status"), "Missing digest verification");
      assert.ok(job.includes("python3 scripts/extract-trusted-ci-artifacts.py"), "Missing bounded extractor");
      assert.ok(!job.includes("tar -xz -f -"), "Unsafe direct tar extraction remains");
      assert.ok(job.indexOf("sha256sum --check --status") < job.indexOf("python3 scripts/extract-trusted-ci-artifacts.py"),
        "Extraction must follow digest verification");
    }
    const extractor = fs.readFileSync("scripts/extract-trusted-ci-artifacts.py", "utf8");
    assert.ok(extractor.includes("member.isfile() and not member.isdir()") ||
      extractor.includes("not member.isfile() and not member.isdir()"));
    assert.ok(extractor.includes("dest.is_relative_to(ROOT / \"build\")"));
    assert.ok(extractor.includes("member.size > 512 * 1024 * 1024"));
  });
  it("does not claim a V4 circuit compile is a real Groth16 proof", function () {
    assert.match(workflow, /A successful build is NOT evidence of a valid Groth16 proof/);
    assert.match(workflow, /no proof generated/);
  });
});
