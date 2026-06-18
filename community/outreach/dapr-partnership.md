# Dapr Community Outreach Plan

**Type**: content / community-engagement  
**Target**: Dapr community (dapr/dapr — CNCF Graduated, 23k+ stars, distributed app runtime)  
**Related Issue**: #18821

---

## Overview

Dapr (Distributed Application Runtime) is a CNCF Graduated project with 23k+ stars, widely used
by microservices teams on Kubernetes. KubeStellar Console has strong multi-cluster visibility, but
no Dapr integration card currently exists.

The Dapr community has active, unanswered questions about "how do I monitor Dapr sidecars across
multiple clusters?" — a gap that KubeStellar Console is uniquely positioned to fill with a
multi-cluster Dapr health card.

---

## Why Now

- **Dapr v1.15** (2026) expanded multi-cluster and ambient-mesh support — the timing aligns
  perfectly with the console's multi-cluster positioning
- Platform engineering teams running Dapr on Kubernetes are exactly the console's target user;
  the overlap in audience is near-total
- Dapr's CNCF graduation means increased ecosystem engagement budgets and co-marketing
  opportunities for aligned projects
- Building a "Dapr health overview" card would bring a 23k-star community into the console's
  orbit — the community size / integration effort ratio is highly favorable
- No competing dashboard currently offers cross-cluster Dapr visibility; this is an uncontested
  differentiation opportunity

---

## Target Audience

| Segment | Channel | Key Pain Point |
|---|---|---|
| Dapr contributors & maintainers | dapr/dapr GitHub Discussions | Ecosystem integrations, v1.15 adoption |
| Microservices platform engineers | Dapr Discord (#general) | "Monitoring Dapr across clusters" |
| CNCF TAG Runtime members | CNCF Slack (#dapr) | Cloud-native runtime observability |
| KubeCon attendees | KubeCon NA 2026 | Distributed runtime + multi-cluster story |

---

## Proposed Actions

### 1. Open a Dapr GitHub Discussion

**Target**: `dapr/dapr` GitHub Discussions  
**Title**: "Community dashboard card for Dapr sidecar health — anyone interested?"

**Content outline**:
- Introduce KubeStellar Console's multi-cluster dashboard model
- Describe the proposed Dapr card: sidecar injection rates, actor health, pubsub component status
- Include a mock-up or description of what the card would show
- Ask: "Which Dapr metrics matter most to your team across clusters?"
- Invite community members to collaborate on the card spec

### 2. Build a Dapr Card (If Interest Confirmed)

**Prerequisite**: Positive response from the GitHub Discussion (action #1)

**Proposed card metrics**:

| Metric | Source | Display |
|---|---|---|
| Sidecar injection rate | Dapr annotations on pods | % injected per namespace/cluster |
| Sidecar health | Dapr sidecar container status | Ready count / total |
| Actor health | Dapr actor CRDs / metrics | Active actors, activation errors |
| Pub/sub component status | `Component` CRDs | Healthy / degraded per component |
| Service invocation errors | Dapr metrics (Prometheus) | Error rate (if metrics available) |
| State store health | `Component` CRDs (type: state.*) | Connected / disconnected |

**Card development**: File a separate card-development issue with this spec once community
interest is confirmed; card development is out of scope for this outreach plan.

### 3. File a console-kb Mission

**Mission name**: "Debugging Dapr sidecar injection failures across clusters"

**Mission spec outline**:
```yaml
name: debug-dapr-sidecar-injection
description: |
  Diagnose Dapr sidecar injection failures across multi-cluster deployments.
  Check namespace annotations, Dapr operator health, and pod injection status.
steps:
  - check: dapr-operator-health
    scope: all-clusters
  - scan: namespace-annotations
    filter: dapr.io/enabled=true
  - check: sidecar-injection-status
    filter: injected=false
    on: annotated-namespaces
  - inspect: pod-events
    on: failed-injection-pods
  - suggest: remediation-actions
```

**Deliverable**: PR to `console-kb` adding this mission as a community resource.

### 4. Present at a Dapr Community Meeting / CNCF TAG Runtime

**Action**: Request a 5-minute slot at a Dapr community call or CNCF TAG Runtime meeting to demo
the console's multi-cluster capabilities and present the Dapr card proposal.

**Dapr community calls**: Check dapr/community repository for call schedule.  
**CNCF TAG Runtime**: Monthly call — check CNCF calendar.

---

## Content Assets Needed

- [ ] 1-paragraph description of KubeStellar Console for the GitHub Discussion introduction
- [ ] Mockup of the proposed Dapr card UI (can be text-based for initial discussion)
- [ ] console-kb mission YAML draft (for action #3)
- [ ] Card specification document (for action #2, after interest confirmed)

---

## Success Metrics

| Metric | Target (90 days) |
|---|---|
| GitHub Discussion engagement (reactions/replies) | 10+ |
| console-kb mission PR merged | Yes |
| Dapr card interest confirmed | Yes/No determined |
| Community call presentation delivered | Yes |
| New GitHub stars from Dapr community | 20+ |

---

## Timeline

| Week | Action |
|---|---|
| Week 1 | Draft GitHub Discussion post; spec mission YAML |
| Week 2 | Open GitHub Discussion on dapr/dapr |
| Week 3 | Open console-kb mission PR |
| Week 4 | Request community call slot (Dapr + CNCF TAG Runtime) |
| Week 6 | Assess card interest; open card-dev issue if confirmed |
| Week 8 | Deliver community call presentation |

---

## Contacts & Resources

- **Dapr GitHub**: https://github.com/dapr/dapr
- **Dapr Community**: https://github.com/dapr/community
- **Dapr Discord**: https://aka.ms/dapr-discord
- **Dapr CNCF page**: https://www.cncf.io/projects/dapr/
- **CNCF TAG Runtime**: https://github.com/cncf/tag-runtime
- **KubeStellar console-kb**: (link to mission set)

---

*Drafted by outreach agent — ACMM L6 (full mode). Filed under issue #18821.*
