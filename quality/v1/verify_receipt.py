"""Validate evidence and gate only the installer round-trip claim."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path, PurePosixPath

from jsonschema import Draft202012Validator, FormatChecker, ValidationError


def verify(receipt, profile_bytes, revision):
    schema = json.loads(Path(__file__).with_name("install-receipt.schema.json").read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(receipt)
    if receipt["sourceRevision"] != revision or receipt["profileSha256"] != hashlib.sha256(profile_bytes).hexdigest():
        raise ValueError("receipt belongs to another revision or profile")
    profile = json.loads(profile_bytes)
    expected = Counter((PurePosixPath(p).name, t) for p in profile["skills"] for t in profile["targets"])
    actual = Counter((r["skill"], r["target"]) for r in receipt["results"])
    if actual != expected or any(count != 1 for count in actual.values()):
        raise ValueError("missing, duplicate or undeclared result cells")
    return all(r["status"] == "pass" for r in receipt["results"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", required=True, type=Path)
    parser.add_argument("--revision", required=True)
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()
    try:
        passed = verify(json.loads(args.receipt.read_text()), args.profile.read_bytes(), args.revision)
    except (ValueError, ValidationError) as error:
        parser.exit(2, f"invalid receipt: {error}\n")
    print("complete receipt; round trips " + ("passed" if passed else "contain failures"))
    raise SystemExit(0 if passed else 1)
