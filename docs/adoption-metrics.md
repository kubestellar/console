# CNCF Sandbox Application Readiness: Adoption Metrics

**Snapshot date:** 2026-06-17
**Primary issues:** [#18773](https://github.com/kubestellar/console/issues/18773), [#18783](https://github.com/kubestellar/console/issues/18783), [#18813](https://github.com/kubestellar/console/issues/18813)
**Related issues:** [#18691](https://github.com/kubestellar/console/issues/18691), [#18746](https://github.com/kubestellar/console/issues/18746)

## Executive summary

KubeStellar Console is in a strong position for CNCF Sandbox application packaging based on current adoption and maturity signals:

| Metric | Current value | Evidence status |
| --- | ---: | --- |
| Confirmed adopters | 13 | Tracked in `ADOPTERS.MD` and community confirmations |
| Dashboard cards | 313 | Implemented and visible in the dashboard card registry/catalog |
| GitHub stars | 117 | Public GitHub repository metric |
| GitHub forks | 119 | Public GitHub repository metric |

Current readiness assessment: **7/10 Sandbox checklist items complete**, with remaining gaps focused on packaging evidence, governance formalization, and repeatable metric snapshots.

## 1) Adoption evidence

### 1.1 Confirmed adopters

| Segment | Count | Current status | Gap |
| --- | ---: | --- | --- |
| Confirmed adopters | 13 | Names and context tracked in `ADOPTERS.MD` | Add deployment archetype tags |
| Production deployers | In progress | Multiple operators have reported production use | Add public references/case studies |
| Prospective adopters | In pipeline | Ongoing onboarding through community channels | Convert to confirmed/public references |

### 1.2 Production deployment evidence quality

| Evidence tier | Definition | Current status | Next action |
| --- | --- | --- | --- |
| Tier 1: Public reference | Blog, talk, or public statement | Limited | Request quote approvals |
| Tier 2: Private confirmation | Maintainer-confirmed usage | Available | Normalize confirmation template |
| Tier 3: Hands-on validation | Mission execution / install outcome | Available | Map to adopter record IDs |

## 2) Community health

### 2.1 GitHub activity and contributor mix

| Indicator | Current view | Interpretation |
| --- | --- | --- |
| Stars/Forks (117/119) | Balanced growth signal | Healthy external interest and experimentation |
| Human contributor ratio | Improving but not yet targetized | Needs explicit quarterly target and reporting |
| Issue/PR throughput | Active | Demonstrates maintainer responsiveness |

**Human contributor ratio target:** establish and track a minimum **60% human-authored merged PR ratio** for the incubation evidence package.

### 2.2 Open community signals

- Community engagement exists across GitHub issues/PRs and maintainer-led outreach.
- Next maturity step is to convert activity into **exportable, timestamped monthly snapshots** suitable for CNCF due diligence packets.

## 3) Usage metrics

| Metric | Current status | Gap | Owner |
| --- | --- | --- | --- |
| Monthly active users (MAU) | Baseline collection available | Publish rolling 3-month trend table | Maintainers + analytics owners |
| Mission executions | Event data available | Break down by successful/failed and project | Mission/marketplace owners |
| Cluster connections | Observable via runtime usage | Normalize by unique installations and time | Platform + telemetry owners |

### 3.1 Data quality notes

- Use aggregated, privacy-respecting counts only.
- Record each metric with **snapshot date, source, and extraction method**.

## 4) Technical maturity

| Area | Current status | Notes |
| --- | --- | --- |
| Dashboard breadth | **313 cards** | Broad ecosystem and operations coverage |
| Test posture | **10,000+ unit tests** | Demonstrates sustained regression protection |
| Security posture | Active, policy-aware | Continue formal audits and published artifacts |
| Release discipline | Established release process | Needs CNCF-facing release evidence summary |

### 4.1 Current technical gaps

1. Publish a single “quality evidence” appendix with test trend snapshots.
2. Add explicit security evidence artifacts (audit status, threat model links, remediation SLAs).
3. Keep card count and coverage metrics synchronized by release.

## 5) Governance and documentation status

| Governance/documentation item | Status | Gap |
| --- | --- | --- |
| Public contributor pathways | Available | Add concise CNCF-facing summary page |
| Decision transparency | Available through issues/PRs | Add explicit governance decision log pointer |
| Community operations docs | Available | Consolidate role definitions and escalation model |
| Adoption evidence docs | In progress | Tie all evidence docs to a single cadence |

## 6) CNCF Sandbox readiness checklist (7/10 complete)

| # | Checklist item | Status | Notes |
| ---: | --- | --- | --- |
| 1 | Public repository and open license | ✅ Complete | Public GitHub project and open-source model |
| 2 | Active maintainer responsiveness | ✅ Complete | Ongoing issue/PR activity |
| 3 | Demonstrable adopter interest | ✅ Complete | 13 confirmed adopters |
| 4 | Technical scope and value proposition clarity | ✅ Complete | 313-card observability/operations scope |
| 5 | Basic governance transparency | ✅ Complete | Public project workflows and docs |
| 6 | Security posture documentation baseline | ✅ Complete | Security docs and practices present |
| 7 | Community growth momentum | ✅ Complete | Stars/forks and contributor activity |
| 8 | Public production case studies | ⚠️ Gap | Need additional publishable references |
| 9 | Formalized governance artifacts for CNCF packet | ⚠️ Gap | Need dedicated evidence bundle |
| 10 | Quarterly evidence snapshot automation | ⚠️ Gap | Need scripted export/reporting |

## 7) Actionable next steps

| Deadline | Action | Outcome |
| --- | --- | --- |
| 2026-07-05 | Lock evidence template for adopter confirmations | Consistent production evidence packet |
| 2026-07-15 | Publish MAU/mission/cluster baseline table (3-month trend) | Usage trajectory ready for review |
| 2026-07-31 | Deliver governance evidence addendum | Closes governance packaging gap |
| 2026-08-15 | Publish first automated adoption snapshot | Reduces manual reporting risk |

## Appendix A: Data collection methods

| Data class | Source | Method | Cadence |
| --- | --- | --- | --- |
| Repository metrics | GitHub API | Automated pull + monthly freeze | Monthly |
| Adopter confirmations | `ADOPTERS.MD` + maintainer validation | Structured confirmation template | Monthly |
| Usage metrics | Console telemetry/analytics exports | Aggregated counters only | Monthly |
| Mission execution counts | Mission/event records | Aggregated by project and result | Monthly |
| Cluster connection metrics | Runtime connection summaries | Aggregated active-connection snapshots | Monthly |
| Security posture evidence | Security docs + audit trackers | Maintainer-curated checklist | Quarterly |

## References

- [Issue #18773](https://github.com/kubestellar/console/issues/18773)
- [Issue #18783](https://github.com/kubestellar/console/issues/18783)
- [Issue #18813](https://github.com/kubestellar/console/issues/18813)
- [Issue #18691](https://github.com/kubestellar/console/issues/18691)
- [Issue #18746](https://github.com/kubestellar/console/issues/18746)
- [Adopters list](../ADOPTERS.MD)
