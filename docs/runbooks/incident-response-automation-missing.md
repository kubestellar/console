# Incident Response Playbook — Missing Automation Runbook

**Repository:** `kubestellar/console`
**Applies to:** `docs/INCIDENT-RESPONSE.md`

---

## Current Status

**Largely resolved.** As of [#23616](https://github.com/kubestellar/console/issues/23616)
the automation the incident-response SLA depends on is wired:

| Piece | State |
|-------|-------|
| `.github/on-call-schedule.yml` | **Exists** — rotation schema with `fallback` = OWNERS approvers. The weekly `rotation` list is still empty; naming it is a maintainer decision. |
| `main-broken` label | **Created on demand** by `main-broken.yml` on first failure (also tracked by [#23615](https://github.com/kubestellar/console/issues/23615)). |
| Failure → label + incident issue | **Wired** — [`.github/workflows/main-broken.yml`](../../.github/workflows/main-broken.yml), `workflow_run` on the main-branch build/test gates, `if: conclusion == 'failure' && event == 'push' && head_branch == 'main'`. |
| Slack post to `#kubestellar-dev` | **Optional / unconfigured** — runs only if the `SLACK_CI_WEBHOOK_URL` repository secret is set. |

The history below is kept so the escalation guidance still makes sense if the
workflow itself is disabled or fails to fire. The original tracking issue,
[#23265](https://github.com/kubestellar/console/issues/23265), was closed as
completed once this runbook was merged (in #23266), before the automation gap it
describes was fixed; a follow-up, [#23367](https://github.com/kubestellar/console/issues/23367),
only fixed this runbook's dead-tracker *reference* (PR #23368). The gap was then
tracked by [#23534](https://github.com/kubestellar/console/issues/23534) and
closed out by the wiring listed above.

## Why This Matters

`docs/INCIDENT-RESPONSE.md` defines a 4-hour recovery SLA for a broken main branch,
an escalation matrix, and a "Build Sheriff" weekly-rotation role responsible for the
SLA clock. That playbook assumes three things exist, and until #23616 none did:

1. **`.github/on-call-schedule.yml`** — the rotation source of truth and SLA owner.
   Now present; the weekly `rotation` is still empty and falls back to OWNERS approvers.
2. **The `main-broken` label** — auto-applied to the PR that broke main. Now created
   on demand by the workflow.
3. **A label-applying / issue-opening workflow step** — now `main-broken.yml`. The
   Slack post to `#kubestellar-dev` remains opt-in via the `SLACK_CI_WEBHOOK_URL`
   secret. (`docs/ALERT_NOTIFICATIONS.md` documents a separate, user-configurable
   *product* Slack-webhook feature for cluster/GPU alerts — unrelated to CI health.)

If any of these regress, a broken main branch produces only a red ❌ in the Actions
tab: no automated notification, no label, and no named owner for the 4-hour clock
the rest of the playbook (escalation matrix, circuit breaker, post-mortem step) is
built on.

## Verifying The Wiring

```bash
# Schedule file exists and resolves someone (fallback until rotation is named):
python3 scripts/resolve-build-sheriff.py --mentions

# Workflow references the label and is gated on main-branch push failures:
grep -n "main-broken\|head_branch == 'main'" .github/workflows/main-broken.yml

# Label exists once the workflow has fired at least once:
gh label list --repo kubestellar/console --search main-broken

# Recent runs of the incident workflow:
gh run list --repo kubestellar/console --workflow "Main Branch Broken" --limit 10
```

## Remaining Follow-ups

1. **Name the weekly rotation** — a maintainer fills `rotation` (and `epoch`) in
   `.github/on-call-schedule.yml`. Until then every incident @-mentions the
   `fallback` list.
2. **Slack** — to get the `#kubestellar-dev` post described in
   `docs/INCIDENT-RESPONSE.md`, a maintainer adds an incoming-webhook URL as the
   `SLACK_CI_WEBHOOK_URL` repository secret. No workflow change is needed.
3. **Pre-create the label** (optional) — `gh label create main-broken` so the
   label exists before the first incident ([#23615](https://github.com/kubestellar/console/issues/23615)).

## Escalation

If main branch breaks and no `main-broken` incident issue appears within a few
minutes of the failing run completing, check the `Main Branch Broken` workflow's
own runs (command above). If it did not fire or failed, do not wait for a
notification that will not arrive: manually open an incident issue, apply the
`main-broken` label, and follow the rest of the playbook's triage/escalation
steps. Open a `workflow-failure`-style issue against `main-broken.yml` itself so
the detection gap is tracked.
