# KEDA Outreach — CNCF Graduated (8k★)

> Tracking issue: [#18998](https://github.com/kubestellar/console/issues/18998)
> Status: Draft outreach kit for community engagement

## Outreach Opportunity

- **Type**: ecosystem-partnership
- **Target**: KEDA project (`kedacore/keda`, CNCF Graduated, ~8k★)

KubeStellar Console ships a `keda_status` card that surfaces multi-cluster KEDA ScaledObject health, trigger metrics, and autoscaling signals in one view.

## Why this matters now

- KEDA v2.16 introduced additional trigger sources, increasing operator visibility needs.
- KEDA adoption across enterprise platform teams aligns with core KubeStellar Console users.
- CNCF graduation opens stronger co-marketing and cross-community amplification paths.

## Proposed actions

1. Open a discussion in `kedacore/keda` highlighting the `keda_status` card and multi-cluster value.
2. Share the same message in KEDA community channels (Slack/GitHub Discussions).
3. Publish a short blog: **"Event-Driven Autoscaling at Scale: Monitoring KEDA across multi-cluster deployments"**.

## Suggested discussion post

**Title**: KubeStellar Console ships a KEDA status card for multi-cluster autoscaling visibility

**Body**:

Hi KEDA community 👋

We shipped a `keda_status` card in KubeStellar Console that provides a consolidated, multi-cluster view of:

- ScaledObject health
- trigger/metric status
- autoscaling-related signals

The goal is to help platform teams running KEDA across many clusters reduce dashboard switching and quickly detect autoscaling drift.

If useful, we'd love feedback from KEDA maintainers/operators on:

1. Additional trigger-specific signals that should be surfaced
2. Preferred health indicators for large-scale KEDA operations
3. Any gaps for day-2 operational visibility

Thanks for taking a look.

## Suggested blog outline

1. Problem: event-driven autoscaling observability fragmentation across clusters
2. Approach: console `keda_status` card + cache-first card architecture
3. Walkthrough: ScaledObject/trigger health across clusters
4. Lessons learned: trigger diversity, autoscaling events, operator UX
5. Call for feedback and contributions from KEDA operators/maintainers

---

*Filed by outreach agent (ACMM L6 — full mode)*
