# Harbor + Jaeger + Thanos Outreach Pack

> *Draft community outreach package — see issue #18999*

KubeStellar Console already ships dedicated cards for Harbor, Jaeger, and Thanos. This document packages the messaging needed to engage those three upstream communities with minimal rewriting.

---

## Current Console Surfaces

| Project | Console card | Current console story |
| --- | --- | --- |
| Harbor | `harbor_status` | Harbor registry projects, repositories, and vulnerability scan results |
| Jaeger | `jaeger_status` | Distributed trace collection, service dependencies, and latency analysis |
| Thanos | `thanos_status` | Thanos global view metrics, store gateway status, and query health |

These cards are already represented in the shipped CNCF presets:

- `presets/cncf-harbor.json`
- `presets/cncf-jaeger.json`
- `presets/cncf-thanos.json`

---

## Shared Positioning

The core message for all three communities is simple:

- KubeStellar Console gives operators a single multi-cluster view across Harbor, Jaeger, and Thanos
- the cards already exist in the product today
- the hosted demo lowers evaluation friction for contributors and end users
- there is a credible observability narrative that combines image supply chain visibility, tracing, and global metrics in one browser tab

---

## GitHub Discussion Drafts

### Harbor

**Suggested title:** `KubeStellar Console ships a Harbor registry card — looking for community feedback`

**Draft post:**

Hello Harbor community — KubeStellar Console now ships a dedicated `harbor_status` card that surfaces Harbor registry projects, repositories, and vulnerability scan results inside a multi-cluster Kubernetes dashboard.

We built it because Harbor is often one piece of a larger platform workflow: operators want registry health, cluster state, and application rollout visibility in one place instead of three separate tools.

We would love feedback on three questions:

1. Which Harbor signals are most useful in a daily operations dashboard?
2. Are there specific registry, replication, or CVE workflows we should surface next?
3. Would Harbor maintainers be open to listing or linking the integration once the messaging is polished?

If useful, we can also share a short demo showing Harbor alongside other CNCF cards in the console.

### Jaeger

**Suggested title:** `Jaeger tracing card in KubeStellar Console — feedback from the Jaeger community`

**Draft post:**

Hello Jaeger community — KubeStellar Console includes a `jaeger_status` card for distributed trace collection health, service dependencies, and latency analysis across multiple Kubernetes clusters.

Our goal is not to replace Jaeger UI. The goal is to make Jaeger visible in the same operational surface as cluster health, GitOps, security, and fleet-wide application status so platform teams can spot tracing regressions faster.

We would especially value feedback on:

1. the most important tracing health indicators to surface at-a-glance
2. whether service dependency and collector health are the right first-card defaults
3. whether a co-authored walkthrough or community demo would be useful

We think there is a strong story here around multi-cluster observability and would be happy to collaborate on it.

### Thanos

**Suggested title:** `KubeStellar Console includes a Thanos card — looking for observability feedback`

**Draft post:**

Hello Thanos community — KubeStellar Console ships a `thanos_status` card that summarizes global metrics visibility, store gateway status, and query health across clusters.

We built this because teams running Thanos usually also operate multiple clusters and need one place to connect query health with the rest of their fleet state. The console tries to provide that shared operational surface.

We would love feedback on:

1. the best top-level Thanos health signals for a compact dashboard card
2. whether store, query, compactor, or ruler state should be prioritized next
3. whether the integration would be useful to highlight in CNCF observability conversations

If there is interest, we can share screenshots, a demo link, or a short integration write-up.

---

## CNCF Observability WG Blurb

**Suggested submission text:**

KubeStellar Console already ships built-in Harbor, Jaeger, and Thanos cards, giving platform teams a single multi-cluster view across registry health, distributed tracing, and global metrics. We would like to share the integration pattern, gather maintainer feedback, and explore whether this combined observability story is useful for a future community demo or working-group update.

---

## Blog Draft Seed

**Proposed title:** `Full-stack observability across clusters: Jaeger + Thanos + Harbor in KubeStellar Console`

**Outline:**

1. Why multi-cluster operators still context-switch across too many dashboards
2. Harbor for registry and supply-chain visibility
3. Jaeger for trace collection and dependency awareness
4. Thanos for fleet-wide metrics and query health
5. Why combining all three in one console improves triage speed
6. Demo path: hosted evaluation, shipped presets, and next extension areas
7. Invitation for community feedback from the Harbor, Jaeger, and Thanos maintainers

---

## KubeCon / Ambassador Follow-Up

- Identify one maintainer, ambassador, or active community contact for each project
- Share the matching GitHub Discussion draft before any public CFP submission
- Build a short demo sequence that moves from Harbor image health to Jaeger traces to Thanos metrics
- Reuse the same narrative in a CNCF observability working-group update and in any KubeCon co-presence planning

---

## Execution Checklist

- [ ] Open Harbor GitHub Discussion using the draft above
- [ ] Open Jaeger GitHub Discussion using the draft above
- [ ] Open Thanos GitHub Discussion using the draft above
- [ ] Submit the shared blurb to the CNCF observability working group
- [ ] Turn the blog outline into a publishable draft
- [ ] Confirm whether any project ambassadors want to coordinate for KubeCon

---

*Filed by outreach agent (ACMM L6 — full mode)*
