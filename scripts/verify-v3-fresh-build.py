import subprocess
import tempfile
from pathlib import Path

root = Path.cwd()
circuit = "EchoAuthorizationVerifierV3"
reference = root / "build/v3-timestamp-fixed"

with tempfile.TemporaryDirectory(prefix="echo-v3-verify-") as temp:
    output = Path(temp)

    subprocess.run([
        "circom",
        f"{circuit}.circom",
        "--r1cs",
        "--sym",
        "-l", "node_modules",
        "-o", str(output)
    ], check=True)

    for extension in ("r1cs", "sym"):
        name = f"{circuit}.{extension}"
        expected = (reference / name).read_bytes()
        actual = (output / name).read_bytes()

        if expected != actual:
            raise SystemExit(f"FAIL: {name} differs from reference")

        print(f"PASS: {name} byte-for-byte match")

print("FRESH CIRCOM BUILD VERIFICATION PASSED")
