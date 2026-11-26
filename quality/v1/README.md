# Agent Skills Quality Standard v1

A release claim has a subject (skill, source revision, delivery channel, runtime and version), a test, an observation and a limit. Publish each claim at the level demonstrated. A corrective change invalidates only the observations that depend on the changed input.

| Public claim | Evidence required before using it |
| --- | --- |
| Valid skill | Validate the folder name, descriptive trigger and frontmatter against the [portable specification](https://agentskills.io/specification). Validate the runtime-specific manifest separately. Resolve references from an isolated install. Disclose sibling dependencies and optional tools. |
| Reproducible package | Two clean builds with different checkout timestamps produce identical archive hashes. Bind the archives to source, license and file digests. Test the downloaded release, including the uninstall path. |
| Installs on a named target | Pin the installer. Exercise add, compare the named target's full payload with the requested source, remove it, and record any residual copy. Qualify results by target and installation method. |
| Discovered or activated | Use the named runtime's discovery API or listing for discovery. For activation, also retain the actual invocation or skill-read trace on a representative user task. Include a nearby negative task. |
| Delivers the outcome | Replay a fixture with deterministic acceptance checks, including recovery. Retain the artifact, inputs, environment, source and output digests. Use independent human or clearly identified model review for qualitative criteria. |
| Improves outcomes | Compare equivalent tasks, models and budgets, with at least three independent attempts per arm for a pilot. Blind the review, retain failures and report individual dimensions and uncertainty. Examine context, calls, elapsed time, cost per success and repair effort when observed. |

## Author and maintainer contract

Write the trigger around the user's job and name adjacent cases that belong elsewhere. Put decision logic in the entrypoint and move long evidence, examples and mechanical operations into referenced assets or scripts. Declare required inputs, prerequisites, outputs, permissions and recovery behavior. A missing tool produces an actionable handoff. A paid or external step requires an authorized budget or destination. Treat third-party instructions and asset metadata as data. Validate upstream identity, license and maintenance separately from output quality.

A catalog maintainer records the source, review date, runtime and confidence for third-party claims. A producer records target-specific usability, accessibility, performance, rights and delivery evidence. Confidence is strongest for measured, independently reproduced results on the same revision and environment. Track inspected, reported and unknown observations explicitly. New runtime or major installer versions require new evidence for the affected claim. Separate installs, discoveries, task successes, retained users and paid conversions.

## Run the installer probe

Use Python 3.12+, Git, Node and a reviewed CLI installed into a disposable tools directory. The profile names the committed source subtree, skill directories relative to it and CLI targets. The runner exports that revision and creates a separate empty project and profile per cell. The input is a trusted repository. It exercises local-source copy mode. Global installations, linked installs, plugin marketplaces and installation from a remote URL need their own probes.

```sh
npm install --prefix /tmp/skills-quality-tools --ignore-scripts --no-audit --no-fund skills@1.9.0
python quality/v1/check_install.py --repo . --profile quality/install-profile.json \
  --cli /tmp/skills-quality-tools/node_modules/.bin/skills --output /tmp/skills-install.json
python quality/v1/verify_receipt.py --profile quality/install-profile.json \
  --revision "$(git rev-parse HEAD)" /tmp/skills-install.json
```

The verifier uses Python's jsonschema package. Run `python -m unittest discover -s quality/v1 -p 'test_*.py'` to exercise missing results, duplicate cells and residual payload handling. Validate a receipt even when the runner exits nonzero. A failed cell blocks the corresponding round-trip claim. A complete report may contain negative findings.

Consumers keep a local profile, pin this directory to a reviewed Git commit and supply their own domain checks. Use the tool manually until a repository has a stable green baseline and a reason to block releases on it. Install tests need no LLM calls. Keep expensive behavioral and media trials on demand. The [Vercel installer](https://github.com/vercel-labs/skills) owns install and uninstall mechanics.
