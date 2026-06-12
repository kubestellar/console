# v0.4 Milestone Scope — AI-Native Observability

> **Status**: Planning document — open for community input  
> **Target**: Q3 2026 (July 1 – September 30)  
> **Author**: strategist agent (ACMM L6)  
> **Filed**: 2026-06-12  
> **Related**: ROADMAP.md § v0.4, #18031, #18032, #18033, #18034, #18035, #18207

---

## Context

The v0.4 milestone ("AI-Native Observability") was defined in ROADMAP.md and targets Q3 2026. As of 2026-06-12 (18 days before Q3 starts), **zero feature PRs have been opened** for any v0.4 deliverable. All recent development has been maintenance: test coverage, security patches, build fixes, and architecture refactoring.

This document proposes a **tiered scope** to make Q3 2026 delivery achievable, and defines explicit success criteria so the milestone can be declared "shipped" or "partially shipped" with confidence.

---

## Original v0.4 Scope (from ROADMAP.md)

| Deliverable | Issue | Status |
|-------------|-------|--------|
| llm-d stack monitoring (EPP, model endpoint health, autoscaler) | #18031 | Help wanted — no PR |
| Drasi reactive pipelines dashboard | #18032 | Help wanted — no PR |
| kagent/kagenti full lifecycle management UI | #18033 | Help wanted — no PR |
| Nightly E2E expansion (8 llm-d guides on OpenShift) | #18034 | Help wanted — no PR |
| Marketplace v2 (live hooks, community review) | #18035 | Help wanted — no PR |
| i18n completeness audit | #18036 | Help wanted — no PR |
| Accessibility audit (WCAG 2.1 AA) | #18037 | Help wanted — no PR |

---

## Proposed Tiered Scope

Given 18 days until Q3 starts and the current zero-PR baseline, delivering all 7 work streams is not realistic. The following tiers prioritize by ecosystem impact and implementation readiness.

### Tier 1 — v0.4.0 Must-Ship (by September 30, 2026)

**llm-d stack monitoring** (#18031)  
Rationale: llm-d is an active CNCF project with strong community momentum. First-class console support is the highest-impact differentiator for the AI/ML Kubernetes audience. Design groundwork (benchmark streaming, GPU cards) already exists in v0.3.

Minimum viable definition:
- At least 3 new dashboard cards: EPP routing status, model endpoint health, autoscaler status
- Demo data fallback for offline/demo mode
- Linked from the existing llm-d benchmark card

**Nightly E2E expansion** (#18034)  
Rationale: Enables continuous verification of llm-d integration across deployment modes. Blocking quality gate for Tier 1.

Minimum viable definition:
- At least 2 of 8 llm-d deployment guides covered by E2E tests on OpenShift
- CI gate: nightly run with pass/fail reporting

### Tier 2 — v0.4.1 Target (by November 30, 2026)

**Drasi reactive pipelines dashboard** (#18032)  
Rationale: Drasi is a newer CNCF project; console integration is a meaningful partnership signal but requires more design work (source/query/reaction topology not yet sketched).

**kagent/kagenti full lifecycle management UI** (#18033)  
Rationale: The MCP bridge and kc-agent integration already exist. kagent/kagenti full lifecycle management is a natural extension with significant scope — needs its own design pass before implementation.

**Marketplace v2** (#18035)  
Rationale: Community review process and live-hook requirement need contributor engagement first.

### Tier 3 — v0.4.x Ongoing

**i18n completeness** (#18036) and **Accessibility audit** (#18037)  
Rationale: These are important but cross-cutting — not milestone-blocking and can land incrementally as community contributions.

---

## Success Criteria for v0.4.0

The v0.4.0 milestone is **DONE** when all of the following are true:

1. ✅ At least 3 llm-d dashboard cards land in a release tag (`v0.4.0` or later)
2. ✅ Cards follow the full `useCached*` / `useCardLoadingState` contract with demo fallback
3. ✅ At least 2 E2E tests cover llm-d deployment on OpenShift in nightly CI
4. ✅ Main branch is green at time of tag
5. ✅ Release notes specifically call out llm-d integration

---

## Revised Timeline

| Date | Milestone |
|------|-----------|
| 2026-06-30 | Feature captain designated; at least 1 llm-d card implementation PR open |
| 2026-07-31 | llm-d Tier 1 cards in code review; E2E tests drafted |
| 2026-08-31 | llm-d cards merged; E2E running in nightly CI |
| 2026-09-30 | v0.4.0 tag cut; release notes published |
| 2026-11-30 | v0.4.1 tag cut (Drasi + kagent/kagenti) |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| No feature captain designated by June 30 | Slips entire timeline by 4+ weeks | Assign in next community call; default to clubanderson as owner |
| llm-d API schema not stable | Cards break on upstream change | Design cards against stable llm-d endpoints only; add semver note |
| Zero non-hive contributors | All implementation falls to hive system | Acceptable for v0.4.0 if timeline is met; community engagement tracked separately |
| Build instability recurrence | Feature PRs blocked pending stabilization | Enforce required status check on `main` before feature merge begins |
| CNCF security audit scheduling (#18207) | Audit delay pushes incubation to Q1 2027 | File CNCF audit request immediately (Q2 2026 action item from ROADMAP) |

---

## How to Claim a Work Item

1. Comment on the relevant issue (#18031, #18032, etc.) with "Taking this"
2. Open a draft PR with the design approach before writing implementation code
3. Tag `@clubanderson` for design review before merging
4. Follow card development rules in `CLAUDE.md` and `AGENTS.md`

---

*This is a living document. The scope tiers may be adjusted based on community capacity and upstream project changes.*
