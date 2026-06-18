# Crossplane Community Outreach Plan

**Type**: ecosystem-partnership  
**Target**: Crossplane project (CNCF Graduated, crossplane/crossplane — 9k+ stars)  
**Related Issue**: #18820

---

## Overview

Crossplane is a CNCF Graduated project for infrastructure-as-code on Kubernetes (Compositions, XRDs,
Providers). It is widely adopted by platform engineering teams — exactly KubeStellar Console's
target audience. The console does not yet have a Crossplane card, but the potential integration is
clear: surface Composite Resource (XR) status, managed resource health, and provider connectivity
across multi-cluster deployments.

This plan outlines how to engage the Crossplane community to validate interest, establish a working
relationship with maintainers, and build toward a Crossplane card contribution and joint presence
at KubeCon NA 2026.

---

## Why Now

- **Crossplane v2.0** shipped in early 2026 with new Composition and Provider APIs — this is peak
  community engagement time, and ecosystem integrations get outsized attention during major releases
- **Platform engineering** is the dominant theme at KubeCon 2026 — Crossplane + KubeStellar Console
  is a natural joint story about managing and observing infrastructure-as-code across clusters
- A console card showing Crossplane Composition health across clusters would be a differentiated
  feature that no other dashboard currently provides
- Crossplane maintainers actively seek ecosystem integrations; their Slack `#integrations` channel
  is active and receptive to well-framed proposals

---

## Target Audience

| Segment | Channel | Key Interest |
|---|---|---|
| Crossplane maintainers | crossplane/crossplane GitHub | Ecosystem tool showcase, v2.0 adoption |
| Platform engineers | Crossplane Slack (#general, #integrations) | Multi-cluster XR visibility |
| CNCF community | CNCF Slack (#crossplane) | Graduated project ecosystem |
| KubeCon attendees | KubeCon NA 2026 | Platform engineering story |

---

## Proposed Actions

### 1. Open a Crossplane Slack Discussion

**Channel**: `#integrations` on Crossplane Slack  
**Message outline**:
- Introduce KubeStellar Console and its multi-cluster platform engineering focus
- Ask: "Would a KubeStellar Console card for Crossplane XR health be useful to this community?"
- Link to existing console cards (for context on the card model)
- Request feedback on which Crossplane metrics/resources would be most valuable to surface

### 2. File a console-kb Mission

**Mission name**: "Debugging a failing Crossplane Composition across clusters"

**Mission spec outline**:
```yaml
name: debug-crossplane-composition
description: |
  Diagnose a failing Crossplane Composite Resource (XR) across multi-cluster deployments.
  Walk through provider connectivity, Composition status, and managed resource events.
steps:
  - check: crossplane-provider-health
    scope: all-clusters
  - check: composite-resource-status
    filter: ready=false
  - inspect: managed-resource-events
    on: failed-resources
  - suggest: remediation-actions
```

**Deliverable**: PR to `console-kb` adding this mission as a community resource, regardless of
whether the Crossplane card is built — the mission has value for manual console-kb debugging.

### 3. Build a Crossplane Card (If Interest Confirmed)

**Prerequisite**: Positive response from Crossplane maintainers/community (from action #1)

**Proposed card metrics**:

| Metric | Source | Display |
|---|---|---|
| Provider health | `providers.pkg.crossplane.io` | Status badge per provider |
| Composite Resource status | `composite.apiextensions.crossplane.io` | Ready/NotReady count |
| Managed resource health | Provider-specific CRDs | Health percentage |
| Composition revision status | `compositionrevisions.apiextensions.crossplane.io` | Active revision |

**Card development**: File a separate card-development issue with this spec once interest is
confirmed; card development is out of scope for this outreach plan.

### 4. Present at a Crossplane Community Meeting

**Action**: Request a 5-minute slot at a Crossplane community call to demo the console's
multi-cluster visibility capabilities and present the card proposal.

**Crossplane community calls**: Bi-weekly — check crossplane/crossplane GitHub for schedule.

---

## Content Assets Needed

- [ ] 1-paragraph description of KubeStellar Console for the Slack introduction
- [ ] Screenshot or GIF of existing console cards (to illustrate the card model)
- [ ] console-kb mission YAML draft (for action #2)
- [ ] Card specification document (for action #3, after interest confirmed)

---

## Success Metrics

| Metric | Target (90 days) |
|---|---|
| Crossplane Slack engagement (replies/reactions) | 5+ |
| console-kb mission PR merged | Yes |
| Crossplane card interest confirmed | Yes/No determined |
| Crossplane community call presentation | Scheduled or delivered |
| Joint KubeCon NA 2026 presence scoped | Yes |

---

## Timeline

| Week | Action |
|---|---|
| Week 1 | Join Crossplane Slack; draft intro message |
| Week 2 | Post in #integrations on Crossplane Slack |
| Week 3 | Draft and open console-kb mission PR |
| Week 4 | Request community call slot |
| Week 6 | Assess card interest; open card-dev issue if confirmed |
| Week 8 | Scope KubeCon NA 2026 joint presence |

---

## Contacts & Resources

- **Crossplane GitHub**: https://github.com/crossplane/crossplane
- **Crossplane Slack**: https://slack.crossplane.io
- **Crossplane CNCF page**: https://www.cncf.io/projects/crossplane/
- **Crossplane v2.0 release notes**: (link to v2.0 release)
- **KubeStellar console-kb**: (link to mission set)

---

*Drafted by outreach agent — ACMM L6 (full mode). Filed under issue #18820.*
