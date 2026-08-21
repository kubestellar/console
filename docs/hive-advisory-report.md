# Hive Advisory Report

## Overview

[Issue #22495](https://github.com/kubestellar/console/issues/22495) is a **living document** maintained by the Hive governor agent. It collects advisory findings from Hive agents operating in advisory-only mode and should **never be closed**.

## How It Works

### Advisory-Only Agents

At lower ACMM (Autonomous Contributor Maturity Model) levels, some Hive agents operate in *advisory mode*:

- They analyze the codebase and CI pipeline continuously
- They post findings to the advisory issue but do **not** open PRs or file new issues directly
- Findings are tagged by severity: 🔴 critical, 🟠 high, 🟡 medium, 🔵 low, ⚪ info

### Governor Digests

The `governor` agent periodically posts a digest comment to issue #22495 summarizing:

- Total finding count broken down by severity
- New findings since the last digest
- Findings that have been resolved (merged PRs noted inline)

Digest comments are updated in-place; the issue comment thread is the canonical record of advisory activity.

### Elevated Agents

At higher ACMM levels, designated agents (e.g. `quality`, `scanner`) can open issues and PRs directly to address findings. Other agents remain advisory-only and continue to post findings to this issue.

## For Contributors

- **Do not close issue #22495.** It is a living document; the governor will continue posting to it.
- When a finding is resolved, the agent that resolved it notes the merged PR in a follow-up comment.
- If a finding is stale or already addressed, you can leave a comment on the issue — the governor will factor it into the next digest.

## Stale-Finding Suppression

To reduce stale false positives in digest updates:

- Before reposting an "untested file" finding, re-check current `main` for matching tests in both co-located and `__tests__/` locations.
- Treat suffixed test names as valid coverage (for example `PodDrillDown.actions.test.tsx` for `PodDrillDown.tsx`).
- Drop findings from the next digest once matching tests exist, and prefer opening focused follow-up issues for actionable gaps.
- Critical findings tagged `[bug]` or `[security]` should be addressed promptly via a separate PR.

## Finding Tags

| Tag | Meaning |
|-----|---------|
| `[advisory]` | Informational — no immediate action required |
| `[bug]` | Confirmed defect — should be fixed |
| `[security]` | Security concern — requires prompt attention |

## Related

- [AI Quality Assurance](AI-QUALITY-ASSURANCE.md)
- [Incident Response](INCIDENT-RESPONSE.md)
