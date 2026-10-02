---
type: llm
---

PASS if the reply says the exit code of claude plugin eval does not depend on the delta, and proposes a CI step that reads the JSON result and exits non-zero when per-case delta or meanDelta is not above zero.
FAIL if it says the exit code already reflects the delta, or its only fix is raising --threshold.
