const { expect } = require("chai");
const fs = require("fs");

describe("ECHO V3 canonical public signal specification", function () {
  const spec = JSON.parse(
    fs.readFileSync("docs/ECHO_V3_PUBLIC_SIGNAL_SPEC.json", "utf8")
  );

  const circuit = fs.readFileSync(
    "EchoAuthorizationVerifierV3.circom", "utf8"
  );

  const sym = fs.readFileSync(
    "build/v3-timestamp-fixed/EchoAuthorizationVerifierV3.sym",
    "utf8"
  );

  const generated = JSON.parse(
    fs.readFileSync(
      "build/v3-timestamp-fixed/public.json", "utf8"
    )
  );

  it("defines 20 sequential unique signals", function () {
    expect(spec.signals).to.have.length(20);
    expect(new Set(spec.signals.map(s => s.index)).size).to.equal(20);

    spec.signals.forEach((signal, index) => {
      expect(signal.index).to.equal(index);
    });
  });

  it("matches the compiled symbol ordering exactly", function () {
    const compiled = sym.trim().split(/\r?\n/)
      .map(line => {
        const parts = line.split(",");
        return {
          index: Number(parts[1]),
          name: parts.slice(3).join(",").replace(/^main\./, "")
        };
      })
      .filter(s => s.index >= 1 && s.index <= 20)
      .sort((a, b) => a.index - b.index);

    expect(compiled).to.have.length(20);

    expect(compiled.map(s => s.name)).to.deep.equal(
      spec.signals.map(s => s.name)
    );
  });

  it("matches all 25 circuit input declarations", function () {
    const declarations = [...circuit.matchAll(
      /^\s*signal input (\w+);/gm
    )].map(m => m[1]);

    expect(declarations).to.have.length(25);

    expect(declarations.slice(0, 20)).to.deep.equal(
      spec.signals.map(s => s.name)
    );
  });

  it("declares exactly the specified 20 public inputs", function () {
    const match = circuit.match(
      /component main\s*\{\s*public\s*\[([\s\S]*?)\]\s*\}/
    );

    expect(match).to.not.equal(null);

    const publicNames = match[1].split(",")
      .map(s => s.trim()).filter(Boolean);

    expect(publicNames).to.have.length(20);

    expect([...publicNames].sort()).to.deep.equal(
      spec.signals.map(s => s.name).sort()
    );
  });

  it("matches the generated proof public signal count", function () {
    expect(generated).to.have.length(20);
  });

  it("preserves checkpoint commitment and timestamp positions", function () {
    expect(spec.signals[18].name)
      .to.equal("expectedCheckpointCommitment");

    expect(spec.signals[19].name)
      .to.equal("expectedCheckpointTimestamp");
  });
});
