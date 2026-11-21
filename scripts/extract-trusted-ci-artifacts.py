#!/usr/bin/env python3
"""Fail-closed extraction of an already digest-verified trusted CI archive."""
import os
import pathlib
import subprocess
import sys
import tarfile
import tempfile

ROOT = pathlib.Path.cwd().resolve()
ARCHIVE = ROOT / ".ci/echo-ci-artifacts.tar.gz.enc"
KEY = os.environ.get("ECHO_CI_ARTIFACT_KEY", "")
if not KEY:
    sys.exit("Missing artifact decryption key")

with tempfile.TemporaryDirectory(prefix="echo-proofs-") as tmp:
    decrypted = pathlib.Path(tmp) / "artifacts.tar.gz"
    with decrypted.open("wb") as output:
        subprocess.run(
            ["openssl", "enc", "-d", "-aes-256-cbc", "-pbkdf2",
             "-in", str(ARCHIVE), "-pass", "env:ECHO_CI_ARTIFACT_KEY"],
            check=True, stdout=output
        )
    with tarfile.open(decrypted, "r:gz") as tar:
        members = tar.getmembers()
        if not members:
            sys.exit("Empty artifact archive")
        for member in members:
            name = pathlib.PurePosixPath(member.name)
            if (name.is_absolute() or ".." in name.parts
                    or not member.isfile() and not member.isdir()
                    or not name.parts or name.parts[0] != "build"):
                sys.exit("Unsafe artifact archive entry")
            dest = ROOT.joinpath(*name.parts).resolve()
            if not dest.is_relative_to(ROOT / "build"):
                sys.exit("Artifact entry escapes build directory")
            if member.isfile() and member.size > 512 * 1024 * 1024:
                sys.exit("Artifact entry exceeds size limit")
        if sum(m.size for m in members if m.isfile()) > 1024 * 1024 * 1024:
            sys.exit("Artifact archive exceeds total size limit")
        for member in members:
            target = ROOT.joinpath(*pathlib.PurePosixPath(member.name).parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.is_symlink():
                sys.exit("Refusing to overwrite symlink")
            source = tar.extractfile(member)
            if source is None:
                sys.exit("Missing archive file payload")
            with source, target.open("wb") as output:
                import shutil
                shutil.copyfileobj(source, output)
print("Trusted artifact extraction completed after archive path validation")
