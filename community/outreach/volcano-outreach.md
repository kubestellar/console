# Volcano GPU Scheduling Community Outreach

**Status**: Draft  
**Owner**: KubeStellar Console team  
**Target audience**: Volcano project community, CNCF Slack #volcano, Volcano maintainers  
**Related Issue**: #18809

## Executive Summary

KubeStellar Console ships GPU monitoring cards including Volcano AI/ML GPU scheduling overview, queue management, and job monitoring. Volcano is a CNCF incubating project used for batch AI/ML workloads on Kubernetes. **Zero engagement has happened** between the two communities despite this feature-complete integration. This document outlines a community outreach strategy to position KubeStellar Console as the monitoring frontend for Volcano GPU scheduling deployments.

## What We Have Built

KubeStellar Console GPU monitoring cards (including Volcano integration) shipped in v0.2 and matured in v0.3:

| Feature | Description |
|---------|-------------|
| Volcano GPU Queue Card | Monitor job queues with priority, jobs per queue, GPU allocation, queue state |
| Volcano Job Status Card | Real-time job monitoring with phase distribution, GPU allocations, completion trends, failed job drill-down |
| GPU Namespace Overview | GPU consumption by namespace, top consumers, utilization %, Volcano queue assignment |
| Multi-Cluster Volcano Deployment | Cross-cluster Volcano controller health and job count |

## Why Partner with Volcano

| Factor | Impact |
|--------|--------|
| Volcano GPU scheduling cards shipped in v0.2 | Matured in v0.3 with production-ready monitoring |
| AI/ML workload management is #1 topic at KubeCon 2026 | Perfect timing for Volcano + Console joint narrative |
| Volcano maintainers actively seek ecosystem partnerships | Growing enterprise adoption — natural fit |
| Console v0.4 roadmap: llm-d + GPU namespace drill-down | Even stronger Volcano story with AI-powered failure analysis |
| KubeCon NA 2026 CFP | "AI/ML batch workload visibility on Kubernetes" with Volcano is a high-acceptance session |

## Proposed Outreach Activities

### Phase 1: Community Introduction (Weeks 1-4)

**Objective**: Make the Volcano community aware of the console integration.

1. **CNCF Slack Post** (`#volcano`)
   - Message: "Console integration exists — looking for feedback on GPU monitoring UX"
   - Include: Screenshots of Volcano cards, link to console.kubestellar.io demo
   - Owner: @clubanderson

2. **GitHub Issue** (`volcano-sh/volcano`)
   - Title: "Ecosystem integration: KubeStellar Console monitors Volcano GPU scheduling"
   - Content: Integration overview, screenshots, request feedback
   - Owner: @clubanderson

3. **Volcano Ecosystem/Adopters PR**
   - Action: Add KubeStellar Console to Volcano docs
   - Link: integration docs + console repo
   - Owner: Console team

4. **Demo Video** (2 minutes)
   - Title: "Monitoring 100 Volcano GPU jobs across 10 clusters with KubeStellar Console"
   - Platform: YouTube + Volcano community channels
   - Owner: Video team

**Success metric**: ≥10 upvotes/comments on Slack post, ≥1 Volcano maintainer responds positively.

### Phase 2: Content Marketing (Weeks 5-12)

**Objective**: Publish technical content that drives Volcano user adoption of the console.

1. **Blog Post**: "End-to-end AI/ML Workload Visibility: Volcano Scheduling + KubeStellar Console Monitoring"
   - Platform: Dev.to + kubestellar.io blog
   - Content: Walkthrough of submitting a Volcano job and monitoring it in the console
   - Co-authoring: Invite Volcano maintainer
   - Owner: @clubanderson

2. **Integration Guide**
   - Platform: docs.kubestellar.io
   - Content: Dedicated Volcano integration page (TODO: create `docs/integrations/volcano.md`)
   - Owner: Docs team

3. **AI/ML Workload Use Case**
   - Platform: Medium
   - Content: "How we monitor GPU utilization for 200 Volcano AI training jobs"
   - Owner: User advocacy team

**Success metric**: ≥300 blog post views in first month, ≥5 console installs with Volcano integration active.

### Phase 3: Event Presence (Weeks 13-24)

**Objective**: Establish console as the Volcano monitoring solution at KubeCon.

1. **KubeCon NA 2026 Co-Talk Proposal**
   - Title: "End-to-end AI/ML workload visibility: Volcano scheduling + KubeStellar Console monitoring"
   - Format: 30-minute session
   - Co-presenting: @clubanderson + Volcano maintainer
   - Owner: @clubanderson

2. **KubeCon Booth Demo**
   - Demo: Live Volcano GPU job submission and monitoring in console
   - Owner: Booth team

3. **Volcano Community Call Demo** (Next available slot)
   - Demo: Console GPU cards and Volcano integration
   - Duration: 15 minutes
   - Owner: @clubanderson

**Success metric**: ≥1 accepted talk or demo slot, ≥30 booth visitors mention Volcano use case.

### Phase 4: Continuous Engagement (Ongoing)

**Objective**: Make console a first-class citizen in the Volcano ecosystem.

1. **Volcano Community Call Participation** (Quarterly)
   - Demo new GPU monitoring features
   - Owner: @clubanderson

2. **Volcano Slack Presence** (Weekly monitoring)
   - Respond to questions in `#volcano` that console can solve
   - Owner: Community team

3. **Joint Webinar** (Q4 2026)
   - Title: "GPU scheduling best practices with Volcano and KubeStellar Console"
   - Co-hosting: Marketing + Volcano maintainer
   - Owner: Marketing team

**Success metric**: Console mentioned in ≥1 Volcano issue or discussion per month.

## Key Messaging

**For Volcano users:**
> "You already trust Volcano for GPU scheduling. KubeStellar Console gives you multi-cluster visibility for job queues, GPU allocation, and batch workload status — all in one dashboard."

**For AI/ML platform teams:**
> "Volcano handles scheduling. KubeStellar Console handles monitoring. Together, you get end-to-end visibility for GPU-accelerated AI/ML workloads."

**For multi-cluster teams:**
> "See Volcano job status across all your clusters without context-switching. One dashboard, real-time updates, AI-powered failure analysis."

## Resources Required

| Item | Estimate | Notes |
|------|----------|-------|
| Blog post authoring | 12 hrs | Technical writing + screenshots + review |
| Demo video production | 6 hrs | Scripting + recording + editing |
| KubeCon travel (co-talk) | $3000 | Airfare + hotel for 1 speaker |
| Booth materials | $300 | Volcano-specific demo setup + one-pagers |
| Community management | 2 hrs/week | Slack monitoring, GitHub issues |

## Success Metrics (6-month horizon)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Volcano project links back to console | ≥1 | GitHub ecosystem page or blog |
| Volcano users open PRs/issues | ≥3 | GitHub issue/PR tags mentioning Volcano use case |
| CNCF Slack mentions | ≥5 | `#volcano` posts referencing console |
| Event talk acceptance | ≥1 | KubeCon NA 2026 or Volcano community call |
| Console installs with Volcano active | ≥10 | Analytics tracking Volcano CRD detection |

## Next Steps

1. **This week**: Post introduction in CNCF Slack `#volcano` with screenshots
2. **Week 2**: Open GitHub issue in `volcano-sh/volcano`
3. **Week 3**: Draft blog post (TODO: create `volcano-blog-draft.md`)
4. **Week 4**: Submit KubeCon NA 2026 CFP for co-talk

## Appendix: Sample CNCF Slack Post

**Channel**: `#volcano`

**Message**:

> Hey Volcano community 👋
>
> KubeStellar Console ships GPU monitoring cards with first-class Volcano integration — thought this might be useful for folks running AI/ML batch workloads.
>
> **What it does**: Multi-cluster visibility for Volcano job queues, GPU allocation per namespace, job status (Pending/Running/Completed/Failed), and queue priorities — all in one dashboard.
>
> **Availability**: Open source, works with any kubeconfig contexts where Volcano is installed. Also has a hosted demo mode at console.kubestellar.io if you want to see it without connecting clusters.
>
> We'd love feedback from the Volcano community — especially if you're running 10+ clusters with GPU workloads and have ideas for what monitoring views would be most useful.
>
> Repo: https://github.com/kubestellar/console  
> Integration docs: (coming soon in docs PR)
>
> Happy to answer questions here or on our Slack (#kubestellar-dev in CNCF workspace).

---

**Fixes**: #18809  
**Last updated**: June 2026
