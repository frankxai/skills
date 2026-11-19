"""Check a committed skill payload with the real skills CLI in disposable project scopes."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import tempfile


TARGETS = {
    "claude-code": ".claude/skills",
    "codex": ".agents/skills",
    "gemini-cli": ".agents/skills",
    "github-copilot": ".agents/skills",
    "opencode": ".agents/skills",
    "hermes-agent": ".hermes/skills",
}


def run(command, cwd, env=None):
    result = subprocess.run(command, cwd=cwd, env=env, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise ValueError(f"{Path(command[0]).name} {command[1]} failed ({result.returncode}): "
                         + (result.stderr or result.stdout)[-600:])
    return result.stdout.strip()


def inventory(folder):
    if not (folder / "SKILL.md").is_file():
        raise ValueError(f"missing entrypoint: {folder.name}")
    result = {}
    for path in sorted(folder.rglob("*")):
        if path.is_symlink():
            raise ValueError("copy profile expects regular files: " + path.name)
        if path.is_file():
            result[path.relative_to(folder).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


def relative(value):
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or "\\" in value or ":" in value:
        raise ValueError("profile paths must be relative to the source")
    return path


def check_one(source, path, target, cli, root):
    name = path.name
    project = root / "project"
    home = root / "home"
    project.mkdir()
    home.mkdir()
    env = {"PATH": os.environ["PATH"], "HOME": str(home), "CI": "1", "NO_COLOR": "1",
           "XDG_CONFIG_HOME": str(home/"config"), "CODEX_HOME": str(home/"codex"),
           "DISABLE_TELEMETRY": "1", "DO_NOT_TRACK": "1"}
    run(["git", "init", "-q"], project, env)
    expected = inventory(source / path)
    run([cli, "add", str(source), "--agent", target, "--skill", name, "--copy", "--yes"], project, env)
    installed = project / TARGETS[target] / name
    # CLI may also keep a shared copy. Every installed entrypoint must be for the selected skill.
    for entry in project.rglob("SKILL.md"):
        if entry.parent.name != name or inventory(entry.parent) != expected:
            raise ValueError(f"unexpected or incomplete installed skill: {entry.relative_to(project)}")
    if installed.is_symlink() or inventory(installed) != expected:
        raise ValueError(f"installed payload differs: {name}")
    run([cli, "remove", name, "--agent", target, "--yes"], project, env)
    scoped_clean = not installed.exists() and not any(project.rglob("SKILL.md"))
    # The project is disposable and contains only this one skill. A shared path can serve
    # several runtimes in a real project, where broader removal needs owner agreement.
    if not scoped_clean:
        run([cli, "remove", name, "--yes"], project, env)
    project_clean = not installed.exists() and not any(project.rglob("SKILL.md"))
    return {"fileCount": len(expected), "entrypointSha256": expected["SKILL.md"],
            "payload": "pass", "scopedRemoval": "pass" if scoped_clean else "residue",
            "projectClean": project_clean, "status": "pass" if scoped_clean and project_clean else "fail"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--profile", required=True, type=Path)
    parser.add_argument("--revision", default="HEAD")
    parser.add_argument("--cli", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    profile = json.loads(args.profile.read_text())
    revision = run(["git", "rev-parse", "--verify", args.revision+"^{commit}"], args.repo)
    paths = [relative(item) for item in profile["skills"]]
    targets = profile["targets"]
    if (not paths or not targets or set(targets) - TARGETS.keys()
            or len(set(targets)) != len(targets) or len({p.name for p in paths}) != len(paths)):
        raise ValueError("empty, duplicate or unsupported profile selections")
    scope = relative(profile["sourceRoot"])
    cli = str(args.cli.resolve(strict=True))
    rows = []
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        source = root / "source"
        source.mkdir()
        tree = revision if scope == PurePosixPath(".") else f"{revision}:{scope}"
        with (root/"snapshot.tar").open("wb") as output:
            subprocess.run(["git", "archive", tree], cwd=args.repo, stdout=output, timeout=60, check=True)
        with tarfile.open(root/"snapshot.tar") as archive:
            archive.extractall(source, filter="data")
        for target in targets:
            for path in paths:
                row = {"skill": path.name, "target": target}
                with tempfile.TemporaryDirectory(dir=root) as testdir:
                    try:
                        row.update(check_one(source, path, target, cli, Path(testdir)))
                    except (OSError, ValueError, subprocess.TimeoutExpired) as error:
                        row.update(status="fail", detail=str(error).replace(str(root), "<temp>"))
                rows.append(row)
        version = run([cli, "--version"], root, {"PATH":os.environ["PATH"], "HOME":temp, "DO_NOT_TRACK":"1"})
    receipt = {"schemaVersion": 1, "dimension":"installer-roundtrip", "sourceRevision":revision,
               "observedAt":datetime.now(timezone.utc).isoformat(), "installerVersion":version,
               "profileSha256":hashlib.sha256(args.profile.read_bytes()).hexdigest(), "results":rows}
    args.output.write_text(json.dumps(receipt, indent=2)+"\n")
    print(f"{sum(row['status']=='pass' for row in rows)}/{len(rows)} installer round trips passed")
    return any(row["status"] != "pass" for row in rows)


if __name__ == "__main__":
    raise SystemExit(main())
