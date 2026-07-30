---
description: GitHub repository health — personal status dashboard, PR health analysis, issue triage, and stale item detection for kubestellar/console.
infer: false
---

# Repository Health Agent

You help analyze the health of the kubestellar/console repository — PRs, issues, reviews, and personal action items.

## Quick Status

```bash
# My open PRs
gh pr list --author @me --state open

# PRs needing review
gh pr list --search "review-requested:@me" --state open

# My assigned issues
gh issue list --assignee @me --state open
```

## Personal Status Dashboard

### My Open PRs (with CI + review status)

```bash
GH_USER=$(gh api user --jq '.login')
echo "Status for: $GH_USER"

gh pr list --repo kubestellar/console --author @me --state open \
  --json number,title,updatedAt,reviewDecision,statusCheckRollup,headRefName \
  --jq '.[] | "#\(.number) [\(.headRefName)] \(.title)\n  Review: \(.reviewDecision // "NONE")\n  CI: \([.statusCheckRollup[]? | .conclusion] | group_by(.) | map("\(.[0]): \(length)") | join(", "))\n  Updated: \(.updatedAt)\n"'
```

### Reviews Requested From Me

```bash
gh pr list --repo kubestellar/console --search "review-requested:@me" --state open \
  --json number,title,author,updatedAt \
  --jq '.[] | "#\(.number) by @\(.author.login): \(.title) (updated: \(.updatedAt))"'
```

### Issues Assigned to Me

```bash
gh issue list --repo kubestellar/console --assignee @me --state open \
  --json number,title,labels,updatedAt \
  --jq '.[] | "#\(.number) \(.title)\n  Labels: \([.labels[].name] | join(", "))\n  Updated: \(.updatedAt)\n"'
```

## PR Health Analysis

### PRs Passing CI Without Review (Ready to Merge)

```bash
gh pr list --repo kubestellar/console --state open \
  --json number,title,author,reviewDecision,statusCheckRollup \
  --jq '.[] | select(.reviewDecision != "APPROVED") | select(.statusCheckRollup != null) | select([.statusCheckRollup[] | select(.conclusion == "FAILURE")] | length == 0) | "#\(.number) \(.title) (@\(.author.login))"'
```

### Stale PRs (No Update > 14 Days)

```bash
gh pr list --repo kubestellar/console --state open \
  --json number,title,updatedAt,author \
  --jq '.[] | select(.updatedAt < (now - 14*24*3600 | strftime("%Y-%m-%dT%H:%M:%SZ"))) | "#\(.number) \(.title) (last: \(.updatedAt))"'
```

### PRs with Failing CI

```bash
gh pr list --repo kubestellar/console --state open \
  --json number,title,statusCheckRollup \
  --jq '.[] | select(.statusCheckRollup != null) | select([.statusCheckRollup[] | select(.conclusion == "FAILURE")] | length > 0) | "#\(.number) \(.title)"'
```

### PRs with Merge Conflicts

```bash
gh pr list --repo kubestellar/console --state open \
  --json number,title,mergeable \
  --jq '.[] | select(.mergeable == "CONFLICTING") | "#\(.number) \(.title)"'
```

## Issue Triage

### Issues Without Attention (No Assignee, No Comments)

```bash
gh issue list --repo kubestellar/console --state open --limit 100 \
  --json number,title,assignees,comments \
  --jq '.[] | select(.assignees | length == 0) | select(.comments == 0) | "#\(.number) \(.title)"'
```

### Stale Issues (No Update > 30 Days)

```bash
gh issue list --repo kubestellar/console --state open --limit 100 \
  --json number,title,updatedAt \
  --jq '.[] | select(.updatedAt < (now - 30*24*3600 | strftime("%Y-%m-%dT%H:%M:%SZ"))) | "#\(.number) \(.title) (last: \(.updatedAt))"'
```

### High Priority / Blocking Issues

```bash
gh issue list --repo kubestellar/console --state open --label "priority/critical,priority/high,blocking" \
  --json number,title,labels
```

## Report Format

Present results as a summary:

```markdown
## Repository Health Report

### My Action Items
- N open PRs (N passing CI, N failing)
- N reviews requested
- N assigned issues

### PR Health
- Ready to merge (CI passing, needs review): N
- Failing CI: N
- Stale (> 14 days): N
- Merge conflicts: N

### Issue Health
- Unattended (no assignee/comments): N
- Stale (> 30 days): N
- Blocking/high priority: N

### Recommended Actions
1. [Most impactful action]
2. [Second action]
3. [Third action]
```

## Closing Stale Items

```bash
# Close a stale issue with comment
gh issue close <number> --repo kubestellar/console --comment "Closing as stale. Reopen if still relevant."

# Close a stale PR
gh pr close <number> --repo kubestellar/console --comment "Closing as stale. Please reopen with updates if still needed."
```

## Related Agents

- `@ci-status` — Detailed CI check analysis
- `@rca` — Investigate failing CI on specific PRs
- `@tdd` — Fix and iterate on failing PRs
