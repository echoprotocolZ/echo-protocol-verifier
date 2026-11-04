import json
import re
from pathlib import Path

spec = json.loads(Path("docs/ECHO_V3_PUBLIC_SIGNAL_SPEC.json").read_text())
sym = Path("build/v3-timestamp-fixed/EchoAuthorizationVerifierV3.sym").read_text()
sol = Path("contracts/EchoAuthorizationVerifierV3.sol").read_text()

signals = spec["signals"]
assert len(signals) == 20
assert spec["publicSignalCount"] == 20

entries = []
for line in sym.splitlines():
    parts = line.split(",", 3)
    if len(parts) == 4 and parts[3].startswith("main."):
        entries.append((int(parts[0]), parts[3][5:]))

for i, signal in enumerate(signals):
    assert signal["index"] == i, f"Wrong documented index: {i}"
    assert entries[i] == (i + 1, signal["name"]), (
        f"Signal mismatch at index {i}: {entries[i]}"
    )
    print(f"PASS [{i}]: {signal['name']}")

assert re.search(
    r"function\s+verifyProof\s*\([^)]*uint\s*\[\s*20\s*\]\s+calldata\s+_pubSignals",
    sol,
    re.S,
), "Solidity verifier does not declare uint[20] public signals"

offsets = [
    int(x)
    for x in re.findall(
        r"checkField\s*\(\s*calldataload\s*\(\s*add\s*\(\s*_pubSignals\s*,\s*(\d+)\s*\)",
        sol,
    )
]

assert sorted(offsets) == list(range(0, 640, 32)), (
    f"Incorrect field-check offsets: {offsets}"
)

assert re.search(
    r"function\s+checkField\s*\(\s*v\s*\)\s*\{\s*"
    r"if\s+iszero\s*\(\s*lt\s*\(\s*v\s*,\s*r\s*\)\s*\)",
    sol,
), "Field validation logic changed"

assert re.search(
    r"\bconstant\s+r\s*=\s*"
    r"21888242871839275222246405745257275088548364400416034343698204186575808495617",
    sol,
), "BN254 scalar field constant changed"

print()
print("ALL 20 PUBLIC SIGNALS VERIFIED")
print("SOLIDITY INPUT COUNT VERIFIED")
print("ALL 20 SCALAR FIELD CHECKS VERIFIED")
