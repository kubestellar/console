# WasmCloud Community Partnership Plan

**Type**: ecosystem-partnership  
**Target**: WasmCloud project (wasmcloud.com, CNCF Incubating, ~2k stars)  
**Related Issue**: #18817

---

## Overview

KubeStellar Console ships a WasmCloud card showing actor/provider health from the console
dashboard. WasmCloud was accepted as a CNCF Incubating project and is growing quickly in the
cloud-native WebAssembly space. The console has had zero engagement with the WasmCloud community
despite shipping this integration.

This plan outlines concrete steps to initiate co-promotion, establish a working relationship with
WasmCloud maintainers, and build toward a joint presence at KubeCon NA 2026.

---

## Why Now

- WasmCloud's graduation to **CNCF Incubating** increases their community event and co-marketing
  budget — they actively seek ecosystem integrations to showcase
- **WebAssembly on Kubernetes** is a growing narrative at KubeCon; a console card that surfaces
  WasmCloud actor/provider state fits the platform engineering story
- WasmCloud maintainers actively seek ecosystem tool integrations for their showcase page and
  community calls
- The existing console card provides a concrete, shippable integration to lead with — no
  promises-only outreach

---

## Target Audience

| Segment | Channel | Key Interest |
|---|---|---|
| WasmCloud maintainers | wasmcloud/wasmcloud GitHub | Ecosystem tool showcase |
| WASM platform engineers | WasmCloud Slack (#general) | Multi-cluster Wasm visibility |
| CNCF community | CNCF Slack (#wasmcloud) | Cloud-native Wasm tooling |
| KubeCon attendees | KubeCon NA 2026 | Joint demo / co-presentation |

---

## Proposed Actions

### 1. Open a GitHub Discussion on wasmcloud/wasmcloud

**Title**: "KubeStellar Console ships a WasmCloud monitoring card — interested in co-promotion?"

**Content outline**:
- Introduce the KubeStellar Console and the existing WasmCloud card
- Include a screenshot of the WasmCloud card in demo mode
- Propose listing KubeStellar Console on the WasmCloud ecosystem page
- Invite maintainer input on additional WasmCloud metrics/features to surface in the card
- Float the idea of a joint blog post or KubeCon demo collaboration

### 2. Submit PR to WasmCloud Ecosystem Page

**Action**: Submit a PR to WasmCloud's documentation or ecosystem page listing KubeStellar Console
as a compatible dashboard/monitoring tool.

**PR content**: 1–2 sentence description of the console + link to the WasmCloud card + screenshot

### 3. Joint Blog Post or Demo

**Options** (to be confirmed with WasmCloud team):
- A joint blog post: "Monitoring WasmCloud Actors Across Kubernetes Clusters with KubeStellar Console"
- A co-demo at KubeCon NA 2026 showing WasmCloud + KubeStellar multi-cluster deployment

**Coordination**: Reach out to WasmCloud maintainers via GitHub Discussion (action #1) to gauge
interest and identify the right contact for co-marketing coordination.

---

## Content Assets Needed

- [ ] Screenshot of WasmCloud card in demo mode (actor list, provider health indicators)
- [ ] 1-paragraph description of the WasmCloud integration for the ecosystem PR
- [ ] Blog post draft outline (if co-blog is confirmed)

---

## Success Metrics

| Metric | Target (90 days) |
|---|---|
| GitHub Discussion engagement (reactions/replies) | 5+ |
| WasmCloud ecosystem page listing | Confirmed |
| Joint blog post or demo | Initiated or scheduled |
| New GitHub stars from WasmCloud community | 10+ |
| KubeCon NA 2026 joint presence | Scoped |

---

## Timeline

| Week | Action |
|---|---|
| Week 1 | Prepare screenshot and ecosystem PR content |
| Week 2 | Open GitHub Discussion on wasmcloud/wasmcloud |
| Week 3 | Submit ecosystem page PR |
| Week 4 | Follow up with maintainers on joint blog/KubeCon interest |
| Week 8 | Finalize KubeCon NA 2026 joint presence scope |

---

## Contacts & Resources

- **WasmCloud GitHub**: https://github.com/wasmcloud/wasmcloud
- **WasmCloud Slack**: https://slack.wasmcloud.com
- **WasmCloud CNCF page**: https://www.cncf.io/projects/wasmcloud/
- **KubeStellar Console WasmCloud card**: (link to card source in repo)

---

*Drafted by outreach agent — ACMM L6 (full mode). Filed under issue #18817.*
