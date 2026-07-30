# PR Triage SLA RFC

> Status: proposed
> Horizon: v0.4 — AI-Native Observability (Q3 2026)
> Related issues: #17587, #19256

## Problem statement

KubeStellar Console uses Claude Code GitHub Actions for AI-assisted PR review and issue triage. PRs and issues labeled `ai-needs-human` indicate cases where the AI agent has identified work that requires human judgment, but without a defined service level agreement (SLA) or escalation path, these items can remain stuck indefinitely. This creates contributor friction, slows down the review pipeline, and undermines the effectiveness of the AI triage system.

Without clear expectations for human review latency, contributors cannot estimate when their PRs will be merged or when Auto-QA findings will be accepted, deferred, or closed. Maintainers also lack prioritization signals to focus their limited review bandwidth.

## Goals

1. Establish measurable SLA targets for PR triage across all states (`needs-review`, `ai-needs-human`, `changes-requested`).
2. Define a clear escalation path for `ai-needs-human` PRs and issues that exceed the SLA threshold.
3. Automate SLA monitoring and alerting to surface stuck PRs before they become stale.
4. Provide contributors with visibility into expected review and triage timelines.
5. Generate weekly triage reports to track SLA adherence and identify bottlenecks.

## Non-goals

- Replacing human judgment with AI — the goal is to accelerate human review, not eliminate it.
- Guaranteeing immediate reviews for all PRs — the SLA establishes targets, not hard commitments.
- Auto-merging PRs without human approval, even when AI review passes.
- Applying SLAs to draft PRs or PRs explicitly marked as work-in-progress.
- Requiring maintainers to implement every Auto-QA finding. The SLA requires a clear decision, not automatic acceptance.

## Current foundation

The Console already has several building blocks for effective PR triage:

- **Claude Code GitHub Action** — AI-assisted PR review deployed in `.github/workflows/claude-code.yml`.
- **Label taxonomy** — Existing labels include `needs-review`, `ai-needs-human`, `changes-requested`, and `auto-qa-failed`.
- **Auto-QA workflows** — Comprehensive automated checks for code quality, test coverage, and UI consistency.
- **GitHub Actions automation** — Infrastructure for scheduled workflows, issue/PR labeling, and notifications.

The missing piece is a defined SLA policy and automation to enforce it.

## Proposed SLA targets

### Tier 1: Critical (24-hour SLA)
- Security fixes (`security` label)
- Production blockers (`priority: critical` label)
- Dependency updates with security advisories (`dependencies` + `security`)

### Tier 2: Standard (3-day SLA)
- Feature PRs from active contributors
- Bug fixes (`bug` label)
- Documentation improvements (`documentation` label)
- PRs labeled `ai-needs-human` after initial AI review

### Tier 3: Community (7-day SLA)
- First-time contributor PRs (`first-time contributor` label)
- Enhancement proposals without linked issues
- Refactoring PRs (`refactor` label)

### Exemptions (no SLA)
- Draft PRs (`draft` state)
- Blocked PRs (`blocked` label)
- PRs awaiting author action (`changes-requested` for >72 hours)

## Escalation path for `ai-needs-human`

When a PR receives the `ai-needs-human` label, the following escalation sequence applies:

1. **Day 0** — AI review completes; PR is labeled `ai-needs-human`; initial comment tags `@kubestellar/maintainers`.
2. **Day 1** — If no maintainer response, automated reminder comment with specific review areas highlighted by AI.
3. **Day 3 (SLA breach)** — Escalation comment tags project lead; PR added to weekly triage agenda; Slack notification to `#kubestellar-dev`.
4. **Day 7** — If still unreviewed, label added to bi-weekly contributor sync agenda; maintainer availability evaluated.
5. **Day 14** — Project lead makes merge/close/defer decision; outcome documented in PR comment.

## Auto-QA issue triage SLA

Auto-QA issues can represent real quality gaps, noisy thresholds, or work that is too broad for a single PR. When an issue receives both `auto-qa` and `ai-needs-human`, the goal is to record a human decision within 14 days.

### Required decision

Each stuck Auto-QA issue should receive one of these outcomes:

- **Accept**: confirm the finding is actionable, remove `ai-processing`, assign or decompose the work, and leave the issue open.
- **Defer**: keep the finding but move it to a milestone, roadmap item, or child issues with a clear follow-up path.
- **Close**: close as not planned when the finding is noisy, too broad, or not worth the maintenance cost.

### Current backlog queue

Issue #19256 tracks four Auto-QA items that need this decision path:

| Issue | Decision needed |
| --- | --- |
| #18599 | Accept or defer the missing component test coverage work. If accepted, keep work in focused child issues. |
| #18598 | Accept oversized test-file refactoring, tune the threshold, or close if large test files are acceptable. |
| #19077 | Accept bundle-size work, tune the chunk-size threshold, or defer to a performance milestone. |
| #19161 | Audit major dependency updates and decide whether to schedule, defer, or close each upgrade path. |

### Escalation path

1. **Day 0**: `ai-needs-human` is added; issue comment states the decision needed.
2. **Day 7**: If no maintainer response, add the issue to the weekly triage agenda and tag a reviewer.
3. **Day 14**: Maintainer records an accept/defer/close decision and removes `ai-processing`.
4. **After Day 14**: If no owner exists to take the work, record **Defer** by closing as **not planned** with a short note to reopen when ownership exists.

## Automation implementation

Deliver SLA enforcement through GitHub Actions workflows:

### `pr-sla-monitor.yml` (scheduled daily)

- Scans all open PRs for SLA violations by tier.
- Posts reminder comments at Day 1, Day 3, Day 7, Day 14 thresholds.
- Adds `sla-breach` label when tier-specific SLA is exceeded.
- Generates Slack notifications to `#kubestellar-dev` for Tier 1 and Tier 2 breaches.

### `pr-triage-report.yml` (scheduled weekly)

- Generates markdown report summarizing:
  - PRs reviewed within SLA (by tier)
  - PRs exceeding SLA (by tier, with links)
  - Average time-to-first-review by label category
  - Top 5 longest-waiting PRs
- Posts report as GitHub Discussion in **Triage Reports** category.
- Emails report to `kubestellar-dev@googlegroups.com`.

### `ai-needs-human-triage.yml` (triggered on label)

- Activates when `ai-needs-human` label is added.
- Parses AI review comment for specific concern categories (security, architecture, breaking change, test coverage, documentation).
- Tags subject-matter experts based on concern category (e.g., `@security-team` for security concerns).
- Sets initial SLA timer for 3-day threshold.

## Contributor visibility

Update `CONTRIBUTING.md` to include:

```markdown
## PR Review SLA

We aim to provide initial feedback on PRs within the following timeframes:

- **Security fixes and critical bugs**: 24 hours
- **Features, bug fixes, and documentation**: 3 days
- **Community contributions and enhancements**: 7 days

PRs labeled `ai-needs-human` are prioritized for human review within 3 days. If your PR exceeds these timelines, please ping `@kubestellar/maintainers` in the PR comments.

You can track SLA status on open PRs via our [weekly triage reports](https://github.com/kubestellar/console/discussions/categories/triage-reports).
```

## Success metrics

- **Primary**: 90% of `ai-needs-human` PRs receive initial human review within 3 days.
- **Secondary**: Average time-to-first-review drops below 2 days for Tier 2 PRs.
- **Tertiary**: Zero `ai-needs-human` PRs remain unreviewed for >14 days.
- **Qualitative**: Contributor feedback on review latency improves (measured via NPS survey comments).

## Implementation phases

### Phase 1: Policy documentation (1 week)
- Draft and merge this RFC.
- Update `CONTRIBUTING.md` with SLA expectations.
- Add SLA policy to PR template.

### Phase 2: Monitoring automation (2 weeks)
- Implement `pr-sla-monitor.yml` workflow.
- Test SLA detection logic on historical PR data.
- Deploy to production with dry-run mode (logging only, no comments).

### Phase 3: Alerting and reporting (1 week)
- Implement `pr-triage-report.yml` workflow.
- Set up Slack webhook for breach notifications.
- Enable comment posting in `pr-sla-monitor.yml`.

### Phase 4: AI-human handoff automation (2 weeks)
- Implement `ai-needs-human-triage.yml` workflow.
- Integrate with existing Claude Code Action output parsing.
- Add subject-matter expert tagging logic.

### Phase 5: Measurement and iteration (ongoing)
- Collect SLA adherence data for 4 weeks.
- Analyze breach patterns and adjust tier thresholds if needed.
- Gather contributor feedback via GitHub Discussions and NPS survey.
- Publish retrospective issue with findings and proposed refinements.

## Open questions

1. Should first-time contributors receive a more lenient SLA (10 days) to account for onboarding review depth?
2. Should we auto-assign PRs to specific maintainers based on file paths touched, or continue with pool-based review?
3. What is the correct escalation for PRs blocked by external dependencies (e.g., upstream Kubernetes API changes)?
4. Should SLA timers pause when a PR is marked `changes-requested`, or continue running to measure total cycle time?

## Related work

- **CNCF Contributor Strategy** — Many CNCF projects use similar SLA-based triage (Kubernetes, Prometheus, Envoy).
- **GitHub Actions marketplace** — Existing actions like `stale` bot and `review-reminder` provide partial solutions but lack tier-based SLA logic.
- **OpenSSF Scorecard** — Project health metrics include PR review latency; improving SLA adherence will boost our OpenSSF score.

## Adoption blockers removed

This RFC directly addresses the **Contributor onboarding** item in `ROADMAP.md` v0.4:

> Establish PR triage SLA, define `ai-needs-human` escalation path, and publish contributor guide update

By delivering measurable SLAs and automation, we remove a key adoption blocker for enterprise contributors who need predictable review cycles to justify open-source participation time.
