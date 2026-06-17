# CNCF Ecosystem Engagement Plan (313-Card Milestone)

**Milestone context:** KubeStellar Console has reached **313 dashboard cards**.
**Primary issues:** [#18773](https://github.com/kubestellar/console/issues/18773), [#18783](https://github.com/kubestellar/console/issues/18783), [#18813](https://github.com/kubestellar/console/issues/18813)
**Related issues:** [#18691](https://github.com/kubestellar/console/issues/18691), [#18746](https://github.com/kubestellar/console/issues/18746)

## Executive context

The 313-card milestone enables an ecosystem-wide engagement motion focused on validation, contributor alignment, and co-marketing with CNCF projects. This document defines how to approach project communities, capture validation evidence, and convert outreach into measurable adoption outcomes.

## 1) Engagement strategy by CNCF project

| Project | Engagement objective | Suggested touchpoint |
| --- | --- | --- |
| Argo CD | Validate GitOps workflows and card usefulness | argo-cd Slack/GitHub discussions |
| Falco | Confirm security telemetry card relevance | Falco community meetings/issues |
| KEDA | Validate autoscaling signals and workflows | KEDA Slack + docs issue |
| Karmada | Validate multi-cluster orchestration observability | Karmada community channels |
| wasmCloud | Confirm app/runtime card value in wasm workflows | wasmCloud maintainers/community calls |
| Volcano | Validate batch/HPC-oriented monitoring surfaces | Volcano SIG meetings/issues |

## 2) Priority target projects (Top 15)

| Priority | Project | Status | Next action |
| ---: | --- | --- | --- |
| 1 | Argo CD | Active outreach | Share validation checklist + request feedback |
| 2 | Falco | Active outreach | Request security card review |
| 3 | KEDA | Active outreach | Validate autoscaler insights |
| 4 | Karmada | Planned | Open cross-repo validation issue |
| 5 | wasmCloud | Planned | Draft joint validation thread |
| 6 | Volcano | Planned | Confirm batch-workload card coverage |
| 7 | OpenCost | Existing relationship | Refresh compatibility matrix |
| 8 | Submariner | Existing relationship | Capture updated adopter feedback |
| 9 | Microcks | Existing relationship | Validate QA/testing card workflows |
| 10 | Notary Project / Ratify | Existing relationship | Validate supply-chain/security cards |
| 11 | OpenTelemetry | Planned | Validate observability data model mapping |
| 12 | Prometheus | Planned | Confirm metrics-path alignment |
| 13 | Flux | Planned | Validate GitOps parity with Argo CD views |
| 14 | Kyverno | Planned | Validate policy-reporting cards |
| 15 | cert-manager | Planned | Validate certificate lifecycle views |

## 3) Outreach message templates

### 3.1 Initial outreach template

> Subject: KubeStellar Console 313-card milestone — request for project feedback
>
> Hi `<project>` maintainers/community,
>
> KubeStellar Console recently reached 313 dashboard cards and includes support patterns relevant to `<project>`. We would value your feedback on whether our cards and workflows reflect real operator needs.
>
> We can provide:
> 1. a short validation checklist,
> 2. a demo walkthrough, and
> 3. a draft co-marketing summary if useful.
>
> If you're open, we will track feedback in a public issue and credit your project collaborators.

### 3.2 Follow-up template (after feedback)

> Thank you for the `<project>` feedback. We incorporated updates in `<issue/PR link>` and would appreciate a final pass. If this looks good, we'd like to include `<project>` in a CNCF ecosystem milestone recap post.

## 4) Validation tracking process

| Step | Action | Evidence artifact |
| --- | --- | --- |
| 1 | Open project-specific tracking issue | Link in central tracker |
| 2 | Share checklist + demo data snapshots | Comment thread with checklist |
| 3 | Capture maintainer/community feedback | Issue comments/meeting notes |
| 4 | Implement updates and link PRs | PR links + before/after notes |
| 5 | Mark validation complete | Final issue summary + sign-off |

### 4.1 Validation status rubric

| State | Definition |
| --- | --- |
| Planned | Outreach list prepared, issue not opened |
| Contacted | Initial outreach message sent |
| In review | Feedback received, changes pending |
| Validated | Project confirms card/workflow alignment |
| Co-marketing ready | Validation complete with publishable quote/material |

## 5) Co-marketing opportunities

| Opportunity | Description | Owner |
| --- | --- | --- |
| CNCF ecosystem milestone blog | Multi-project post featuring validation outcomes | Maintainers + project contributors |
| Joint demos | Community call demos with partner projects | Outreach owners |
| Social campaign | Threaded posts highlighting project-specific card wins | Community team |
| Conference snippets | Include partner quotes in talks/proposals | Speakers/maintainers |

## 6) Cross-repo issue tracking

| Tracker type | Location | Purpose |
| --- | --- | --- |
| Central meta issue | `kubestellar/console` (meta) | Track all outreach and validation states |
| Per-project issue | Project repo or discussion forum | Capture project-specific feedback |
| Implementation PRs | `kubestellar/console` PRs | Link code/doc updates to feedback |

## 7) Success metrics

| Metric | Target by Q4 2026 |
| --- | --- |
| Priority projects contacted | 15/15 |
| Projects with active feedback threads | ≥12 |
| Fully validated projects | ≥8 |
| Co-marketing-ready projects | ≥5 |
| Cross-repo linked issues/PRs | 100% of outreach items |

## 8) Current gaps and immediate next steps

| Gap | Action | Deadline |
| --- | --- | --- |
| No unified central tracker | Open meta issue and seed all 15 project links | 2026-06-24 |
| Inconsistent outreach messaging | Adopt templates in this document | 2026-06-26 |
| Missing validation rubric usage | Add rubric state to every project issue | 2026-06-30 |
| Co-marketing pipeline not formalized | Publish owner map and blog draft schedule | 2026-07-05 |

## References

- [Issue #18773](https://github.com/kubestellar/console/issues/18773)
- [Issue #18783](https://github.com/kubestellar/console/issues/18783)
- [Issue #18813](https://github.com/kubestellar/console/issues/18813)
- [Issue #18691](https://github.com/kubestellar/console/issues/18691)
- [Issue #18746](https://github.com/kubestellar/console/issues/18746)
