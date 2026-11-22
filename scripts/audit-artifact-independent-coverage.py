#!/usr/bin/env python3
"""Report which Hardhat tests the artifact-independent CI selector omits.

This is a coverage inventory, NOT evidence that excluded tests passed.
Keep selection logic in sync with v4-security-regression.yml until a
reviewed explicit manifest replaces the heuristic.
"""
from pathlib import Path
import argparse
import json
import re
import sys

EXCLUDED = re.compile(
    r"(full-flow|real-proof|echo-v3-v4-solidity-positive-groth16|"
    r"echo-v3-real-authorization-integration|"
    r"echo-v4-real-coordinated-dual-proof|"
    r"echo-v4-solidity-proof|"
    r"echo-v4-gateway-error-security|"
    r"echo-v4-geographic-gateway|"
    r"echo-z-artifact-integrity|"
    r"echo-z-positive-initialization)"
)
MARKERS = (
    "echo-real-dual-proof",
    "groth16.fullProve",
    "groth16FullProve",
    "witnessCalculator",
    ".wasm",
    ".zkey",
    "production-evidence/compiler-output.json",
    "build/v4-geographic-bound/proofs",
)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--print-included", action="store_true", help="Print only test paths for CI execution")
    args = parser.parse_args()
    root = Path("test")
    if not root.is_dir():
        sys.exit("ERROR: run from repository root; test/ missing")
    included, excluded = [], []
    for path in sorted(root.glob("*.js")):
        body = path.read_text(errors="replace")
        reasons = []
        if EXCLUDED.search(path.stem):
            reasons.append("filename-exclusion")
        reasons.extend("content:" + marker for marker in MARKERS if marker in body)
        if reasons:
            excluded.append({"path": str(path), "reasons": reasons})
        else:
            included.append(str(path))
    manifest = json.loads(Path("ci/artifact-dependent-test-manifest.json").read_text())
    listed = manifest["excluded_files"]
    if len(listed) != len(set(listed)):
        sys.exit("ERROR: duplicate files in artifact-dependent manifest")
    actual = {item["path"] for item in excluded}
    expected = set(listed)
    if actual != expected:
        print("ERROR: artifact-dependent manifest differs from selected exclusions", file=sys.stderr)
        for name in sorted(actual - expected):
            print("UNREVIEWED EXCLUSION " + name, file=sys.stderr)
        for name in sorted(expected - actual):
            print("STALE EXCLUSION " + name, file=sys.stderr)
        sys.exit(1)
    if not included:
        sys.exit("ERROR: selector would execute zero tests")
    report = {
        "classification": "heuristic selector with reviewed exclusion manifest; included tests not explicitly classified",
        "included_count": len(included),
        "excluded_count": len(excluded),
        "included": included,
        "excluded": excluded,
    }
    output = Path("artifact-independent-coverage.json")
    output.write_text(json.dumps(report, indent=2) + "\n")
    if args.print_included:
        for name in included:
            print(name)
        return
    print(f"Artifact-independent files: {len(included)}")
    print(f"Excluded files requiring review: {len(excluded)}")
    for item in excluded:
        print(f"EXCLUDED {item['path']}: {', '.join(item['reasons'])}")
    print(f"Report: {output}")

if __name__ == "__main__":
    main()
