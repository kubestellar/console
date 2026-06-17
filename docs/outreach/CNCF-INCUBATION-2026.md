# CNCF Incubation Q4 2026: Community Evidence Package

**Target**: CNCF TOC Application — Q4 2026

## Timeline

| Month | Action |
|-------|--------|
| June–July 2026 | Complete adoption-metrics.md; contact 5 production adopters |
| August 2026 | GOVERNANCE.md, contributor ratio improvement |
| September 2026 | Draft TOC application; blog post on CNCF blog |
| October 2026 | Submit TOC application |

## Prerequisites

### Documentation
- [ ] Complete `docs/ADOPTION-METRICS.md` — replace all TBD fields with real measurements (GA4 DAU, mission execution counts, cluster connections, GitHub stats)
- [ ] Write `GOVERNANCE.md` — define decision-making process, maintainer nomination, and code of conduct enforcement
- [ ] Write `SECURITY.md` or ensure existing security docs meet CNCF criteria

### Community Evidence
- [ ] **Reach out to 5 organizations** currently using console-kb mission sets (from ADOPTERS.md) and ask them to upgrade their entry to "Production Adopter" with a use case description
- [ ] **Contact Red Hat/OpenShift team** — the console has first-class OpenShift support; document their usage for the adopters package
- [ ] **Contact LLM-d/vLLM community** — 9 LLM-d missions and 16 vLLM missions exist in console-kb; request a quote or use case
- [ ] **Brief the KubeStellar core maintainers** on the incubation timeline — they need to be co-applicants

### Community Growth
- [ ] **Raise human contributor ratio** from 0% to ≥10% before application — track via ROADMAP health dashboard
- [ ] **Publish a blog post** on the CNCF blog: "KubeStellar Console: AI-powered multi-cluster operations reaches 13 CNCF ecosystem adopters"

## Current Gap Analysis

| Criteria | Current State | Target | Gap |
|----------|--------------|--------|-----|
| ADOPTERS.md | 13 entries, all install-mission adopters | ≥3 production deployers | Need real production use cases |
| Human contributor ratio | 0% of merges | ≥10% | Need to solicit external PRs |
| adoption-metrics.md | Multiple `TBD` fields | All fields filled | Need real measurements |
| CNCF Sandbox listing | In-progress (#18773) | Prerequisite | Dependency on #18773 |
| Governance docs | Gap mentioned in ROADMAP | OWNERS + GOVERNANCE.md | Need formal structure |

## Contact Strategy

### Production Adopters (Priority 1)
Identify and reach out to organizations from the 13 ADOPTERS.md entries:
1. Select 5 organizations with the most advanced mission set usage
2. Request a brief use case description (1-2 paragraphs)
3. Ask permission to feature their name and use case in CNCF application

### Red Hat/OpenShift Partnership (Priority 2)
- Console has first-class OpenShift support via dedicated cards
- Reach out to Red Hat cloud team; request a quote on console-kubestellar integration

### LLM-d/vLLM Community (Priority 3)
- 25 LLM-focused missions exist
- Contact LLM-d and vLLM maintainers; request quote on console as their unified monitoring dashboard

### KubeStellar Core Team (Priority 0)
- Brief the core maintainers on the Q4 2026 timeline
- Ensure they're ready to be co-applicants
- Discuss co-marketing strategy

## Expected Outcomes

- **≥3 production adopters** documented with use cases
- **≥10% human merge ratio** in CI
- **All TBD fields** in adoption-metrics.md populated with GA4/GitHub data
- **Governance structure** formalized and published
- **CNCF blog post** published 2 weeks before application
- **TOC application package** ready for submission

## Notes

- This timeline is aggressive; start community outreach immediately
- CNCF Sandbox listing (#18773) is a prerequisite for incubation application
- Archive all community evidence (emails, quotes) for due-diligence documentation
