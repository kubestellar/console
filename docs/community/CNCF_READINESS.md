# CNCF Readiness Checklist

This checklist consolidates the documentation and evidence needed for KubeStellar Console's CNCF Sandbox readiness work and the Q4 2026 incubation evidence package.

**Snapshot date:** 2026-06-17

## Issue Mapping

- [#18674](https://github.com/kubestellar/console/issues/18674) — CNCF Landscape listing verification
- [#18773](https://github.com/kubestellar/console/issues/18773) — Sandbox application readiness
- [#18783](https://github.com/kubestellar/console/issues/18783) — Incubation community evidence package

## Readiness Summary

| Area | Status | Evidence / Next step |
| --- | --- | --- |
| Governance charter | ✅ Ready | [GOVERNANCE.md](../../GOVERNANCE.md) defines roles, lazy consensus, voting, maintainer expectations, and amendment rules |
| Code of conduct | ✅ Ready | [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md) adopts the CNCF Code of Conduct and reporting paths |
| Security policy | ✅ Ready | [SECURITY.md](../../SECURITY.md) defines private reporting, response targets, and disclosure expectations |
| Maintainer roster | ✅ Ready | [MAINTAINERS.md](../../MAINTAINERS.md) and [OWNERS](../../OWNERS) identify current maintainers and approvers |
| Community channels | ✅ Ready | [docs/COMMUNITY.md](../COMMUNITY.md) lists Slack, mailing lists, discussions, and meeting process |
| Roadmap alignment | ✅ Ready | [ROADMAP.md](../../ROADMAP.md) includes Sandbox/incubation goals and community-health prerequisites |
| Adopters structure | ✅ Structured, evidence still growing | [ADOPTERS.md](../../ADOPTERS.md) now separates reference deployment, production, pilot, and ecosystem evidence |
| Adoption metrics | ⚠️ Needs data collection | [docs/ADOPTION-METRICS.md](../ADOPTION-METRICS.md) exists but still contains `TBD` placeholders |
| Production adopter references | ⚠️ In progress | Public production references still need outreach and permission before they can be added to [ADOPTERS.md](../../ADOPTERS.md) |
| Human contributor ratio | ⚠️ In progress | Track against roadmap health targets before incubation filing |
| CNCF Landscape listing | ⚠️ Verified gap | GitHub code search in `cncf/landscape` on 2026-06-17 did not find `KubeStellar Console` or `kubestellar`; open an external landscape PR after maintainer confirmation |
| CNCF application draft | ⚠️ Not started here | Sandbox/incubation submission narrative still needs a dedicated TOC application draft |

## Checklist

### 1. Required project-policy documents

- [x] [LICENSE](../../LICENSE)
- [x] [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)
- [x] [GOVERNANCE.md](../../GOVERNANCE.md)
- [x] [SECURITY.md](../../SECURITY.md)
- [x] [MAINTAINERS.md](../../MAINTAINERS.md)
- [x] [OWNERS](../../OWNERS)
- [x] [ROADMAP.md](../../ROADMAP.md)

### 2. Community and governance evidence

- [x] Public community channels documented in [docs/COMMUNITY.md](../COMMUNITY.md)
- [x] Maintainer nomination and removal process documented in [GOVERNANCE.md](../../GOVERNANCE.md)
- [x] Code of Conduct enforcement path documented in [CODE_OF_CONDUCT.md](../../CODE_OF_CONDUCT.md)
- [ ] Publish or link recurring public meeting notes for easy reviewer access
- [ ] Document PR triage SLA adoption progress (see [docs/plans/PR-TRIAGE-SLA.md](../plans/PR-TRIAGE-SLA.md))

### 3. Adoption evidence

- [x] Public adopter index maintained in [ADOPTERS.md](../../ADOPTERS.md)
- [x] Reference deployment publicly documented
- [x] Ecosystem integration evidence preserved with links to public issues, PRs, or mission pages
- [ ] Add at least 3 named public production adopters with permission
- [ ] Add named pilot / staging adopters where public references exist
- [ ] Replace placeholders in [docs/ADOPTION-METRICS.md](../ADOPTION-METRICS.md) with measured data

### 4. Security and due-diligence evidence

- [x] Private vulnerability intake path documented
- [x] Response-time expectations documented
- [x] Disclosure coordination described
- [x] Additional security docs linked from the policy
- [ ] Track third-party audit request and outcome for incubation readiness

### 5. CNCF-specific follow-ups

- [ ] Draft the Sandbox submission narrative and TOC checklist response
- [ ] Prepare incubation evidence package using adoption metrics, community metrics, and contributor-ratio data
- [ ] Verify / add KubeStellar Console entry in the CNCF Landscape under the appropriate category
- [ ] Add the landscape PR or accepted listing link back into this checklist once available

## Recommended Next Actions

1. Fill the remaining `TBD` values in [docs/ADOPTION-METRICS.md](../ADOPTION-METRICS.md).
2. Collect written permission from at least three production users to be named in [ADOPTERS.md](../../ADOPTERS.md).
3. Open the external `cncf/landscape` update once maintainers confirm the desired category and card wording.
4. Draft the Sandbox / incubation submission narrative using this checklist as the source-of-truth status page.
