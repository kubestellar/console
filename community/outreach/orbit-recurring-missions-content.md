# Orbit Recurring Missions — Public Content Plan

**Type**: content / ecosystem-positioning  
**Target**: Orbit recurring mission system users + KubeStellar community  
**Related Issue**: #18818

---

## Overview

KubeStellar Console's `Orbit` subsystem enables recurring AI missions for proactive cluster
maintenance — scheduled tasks like certificate rotation checks, capacity planning scans, and drift
detection. This is a significant differentiation over static dashboards, but there is **zero public
content** explaining it or showcasing it to the wider community.

This document outlines a content plan to introduce Orbit to the community, provide concrete demo
material, and position KubeStellar Console as a leader in the emerging AIOps/autonomous Kubernetes
space ahead of KubeCon NA 2026.

---

## Why Now

- **"AIOps" and "autonomous Kubernetes"** are emerging as major themes for H2 2026 conferences,
  including KubeCon NA 2026 — Orbit is a genuine implementation of this capability
- A short demo video or blog post showing Orbit running a nightly certificate expiry check would be
  highly shareable in the platform engineering and SRE communities
- This directly supports the **KubeCon NA 2026 CFP submission** (#18810) by providing concrete demo
  material and public evidence of the feature's maturity
- Orbit's proactive maintenance story differentiates KubeStellar Console from all competing
  dashboards and observability tools

---

## Content Assets to Create

### Asset 1: Blog Post

**Title**: "Set it and forget it: Proactive cluster maintenance with KubeStellar Console Orbit"

**Audience**: Platform engineers, SREs, DevOps leads evaluating Kubernetes automation

**Content outline**:
1. The problem: reactive cluster management leads to surprise outages
2. What Orbit is: a recurring mission scheduler built into KubeStellar Console
3. Example: "Nightly TLS certificate expiry check across all clusters"
   - Configure the mission once
   - Orbit runs it on schedule
   - Console surfaces results; alerts fire if certs are near expiry
4. More mission examples: capacity planning, drift detection, policy compliance
5. How to get started: link to `console-kb` Orbit missions
6. Call to action: try demo mode, submit your own Orbit mission ideas

**Estimated length**: 1,400–2,000 words  
**Target publication**: KubeStellar blog + CNCF blog syndication

### Asset 2: Demo console-kb Mission

**Mission name**: "Nightly TLS certificate expiry check across all clusters"

**Mission spec outline**:
```yaml
name: nightly-tls-cert-check
schedule: "0 2 * * *"   # 2 AM nightly
description: |
  Check all TLS certificates across registered clusters for expiry within 30 days.
  Alert via console notification if any certificate expires within the warning window.
steps:
  - scan: tls-certificates
    scope: all-clusters
    warning-threshold: 30d
    critical-threshold: 7d
  - notify:
      on: warning-or-critical
      channel: console-alerts
```

**Deliverable**: PR to `console-kb` repo adding this mission with full YAML + README

### Asset 3: Demo Video Script

**Format**: 90-second screen recording with voiceover

**Script outline**:

> "Most Kubernetes dashboards tell you what's broken. KubeStellar Console with Orbit tells you
> what's *about* to break.
>
> [Show Orbit mission scheduler UI]
>
> Orbit runs recurring AI missions on your clusters — on a schedule you define. Here's a mission
> that checks TLS certificate expiry nightly across all three clusters.
>
> [Show mission running; results appearing]
>
> Two certificates expiring in 12 days — Orbit caught it before the outage.
>
> [Show alert notification in console]
>
> One configuration. Zero manual checks. KubeStellar Console Orbit."

**Production notes**:
- Record in demo mode (no real cluster needed)
- Add captions for accessibility
- Export as MP4 (1080p) and GIF (short clip for social)

---

## Distribution Plan

### Primary Channels

| Channel | Content | CTA |
|---|---|---|
| KubeStellar blog | Full blog post | Link to console-kb |
| CNCF blog syndication | Repost/summarize | Link to KubeStellar blog |
| CNCF Slack #kubestellar | Blog link + short summary | Star the repo |
| KubeStellar community call | 5-minute demo using video script | Q&A |
| LinkedIn / X (Twitter) | Short-form version + GIF clip | Link to blog |
| KubeCon NA 2026 CFP | Demo material + blog as prior art | N/A (support #18810) |

---

## Success Metrics

| Metric | Target (90 days) |
|---|---|
| Blog post views | 800+ |
| console-kb Orbit mission PR merged | Yes |
| Demo video views (wherever hosted) | 300+ |
| Community questions/reactions on Orbit | 10+ |
| Mentions in KubeCon CFP materials | Referenced |

---

## Timeline

| Week | Action |
|---|---|
| Week 1 | Draft blog post outline; spec demo mission YAML |
| Week 2 | Complete blog post draft; open PR on console-kb |
| Week 3 | Record demo video (using demo mode) |
| Week 4 | Publish blog post; share in CNCF Slack + community call |
| Week 6 | Syndicate to CNCF blog |
| Week 8 | Review metrics; plan KubeCon NA 2026 inclusion |

---

## Related Work

- **KubeCon NA 2026 CFP**: #18810 — Orbit content directly supports the CFP submission
- **Orbit subsystem docs**: (link to internal docs or architecture.md)
- **console-kb repository**: (link)

---

*Drafted by outreach agent — ACMM L6 (full mode). Filed under issue #18818.*
