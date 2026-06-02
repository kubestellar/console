# CNCF Incubation: Adopter Conversion Strategy

**Status**: Draft — Human review required before acting on any outreach
**Owner**: Maintainers + Community
**Target**: ≥3 independent formal adopters in `ADOPTERS.md` by Q4 2026
**Related**: Issue #16436, Incubation Tracker #4072

---

## Context

KubeStellar Console is a CNCF Sandbox project. The sole remaining hard blocker
for filing the CNCF Incubation application is **≥3 independent formal adopters**.
Every other incubation criterion is complete or in-progress (see #4072).

The project has strong interest signals (110 stars, 118 forks, active GA4
engagement on console.kubestellar.io) but has not yet converted this interest
into formal `ADOPTERS.md` entries. This document describes a structured
pipeline to make that conversion.

---

## Adopter Qualification Criteria

CNCF does not require production deployments for incubation. The bar is:

| Tier | Description | Qualifies for ADOPTERS.md? |
|------|-------------|---------------------------|
| **Evaluating** | Org has deployed the demo or self-hosted Console in a dev/test env | ✅ Yes (with note) |
| **Development** | Org uses Console regularly for internal cluster management | ✅ Yes |
| **Production** | Org uses Console in a production cluster | ✅ Yes (stronger signal) |

Lower the bar for the initial filing: **"Evaluating"** entries are acceptable.
CNCF reviewers care that the project has real external users — quality of use
matters more than scale.

---

## Pipeline Stages

```
Aware → Interested → Evaluating → Committed (ADOPTERS.md entry)
```

### Stage 1 — Aware (≈1 week to action)

Sources of warm leads:
- GitHub **forks** (118) — strongest signal; forkers have already invested time
- GitHub **stargazers** (110) — lighter signal but reachable
- console.kubestellar.io **GA4 data** — organizations that visited multiple times
- CNCF Slack **#kubestellar-dev** participants
- KubeStellar parent project adopters who haven't yet adopted Console

Action: Export fork owners and star-givers with `gh api`; filter to org accounts
(not personal accounts); identify 15–20 highest-signal orgs.

### Stage 2 — Interested (≈1 week to convert)

Warm outreach approach:
1. **Direct GitHub message** — open a friendly "We noticed you forked Console"
   issue or discussion ping (not a cold email blast)
2. **CNCF Slack post** — Post in `#kubestellar-dev` and `#cncf-adopters` with
   a "Is your org using Console? We'd love to list you in ADOPTERS.md"
3. **KubeStellar community call** — Raise adopter ask at the next community call
   and record it for async attendees

### Stage 3 — Evaluating (≈2 weeks to convert)

Conversion accelerators:
- Make `ADOPTERS.md` contribution friction-free: pre-filled PR template with
  one-line entry format
- Add a CTA to the hosted demo: "Using Console? Add your org →
  kubestellar/console/blob/main/ADOPTERS.md"
- Lower the entry bar explicitly in ADOPTERS.md header: "Evaluating counts"
- Offer "Adopter badge" for READMEs (generates a small reputational incentive)

### Stage 4 — Committed (ADOPTERS.md entry created)

Once an org agrees:
1. Open a PR to `ADOPTERS.md` with their entry (they can author it or we draft it)
2. Thank them publicly in release notes and community calls
3. Invite them to contribute a dashboard card for their stack (turns adopters
   into contributors — serves the human contributor diversity goal simultaneously)

---

## ADOPTERS.md Format

Proposed entry format (matches CNCF norm):

```markdown
| Organization | Contact | Use Case | Since |
|---|---|---|---|
| Acme Corp | @acme-github | Evaluating for multi-cluster fleet management | 2026-Q3 |
```

---

## Outreach Tracker

Maintain a GitHub Project board with columns:
`Contacted | Responded | Evaluating | Committed | Declined`

---

## Success Criteria

- [ ] ≥3 entries in `ADOPTERS.md` representing independent organizations
- [ ] At least 1 entry at "Development" or "Production" tier
- [ ] CNCF incubation application filed by Q4 2026

---

## References

- [CNCF Incubation Criteria](https://github.com/cncf/toc/blob/main/process/graduation_criteria.md)
- [CNCF ADOPTERS best practices](https://github.com/cncf/toc/blob/main/process/adopters.md)
- Issue #16436 — Adopter conversion pipeline
- Issue #4072 — CNCF Incubation Readiness Tracker

---

*Planning artifact — filed by strategist agent (ACMM L5 — hold-gated mode).
Hold-gated: human review and action required.*
