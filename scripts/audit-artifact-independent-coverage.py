#!/usr/bin/env python3
"""Report which Hardhat tests the artifact-independent CI selector omits.

This is a coverage inventory, NOT evidence that excluded tests passed.
Keep selection logic in sync with v4-security-regression.yml until a
reviewed explicit manifest replaces the heuristic.
"""
from pathlib import Path
import json
import re
import sys

EXCLUDED = re.compile(
    r"(full-flow|real-proof|"
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
    if not included:
        sys.exit("ERROR: selector would execute zero tests")
    report = {
        "classification": "heuristic; not a complete security test manifest",
        "included_count": len(included),
        "excluded_count": len(excluded),
        "included": included,
        "excluded": excluded,
    }
    output = Path("artifact-independent-coverage.json")
    output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Artifact-independent files: {len(included)}")
    print(f"Excluded files requiring review: {len(excluded)}")
    for item in excluded:
        print(f"EXCLUDED {item['path']}: {', '.join(item['reasons'])}")
    print(f"Report: {output}")

if __name__ == "__main__":
    main()
