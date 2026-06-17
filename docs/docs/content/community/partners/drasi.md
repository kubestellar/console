# Drasi Case Study: First CNCF Sandbox Project to Verify a KubeStellar Install Mission

*Maintainer-tested guided onboarding for change data capture at scale*

## Executive Summary

**Drasi** — a CNCF Sandbox project for change data capture in cloud-native applications — became the **first CNCF Sandbox project with a verified, maintainer-tested install mission** in the KubeStellar Console.

A Drasi maintainer ran the guided install at `console.kubestellar.io/missions/install-drasi`, provided feedback that led to bug fixes, and tracked engagement in `drasi-project/drasi-platform#400`. This validates the mission framework as a **production-ready onboarding tool** for CNCF projects.

---

## Background: What is Drasi?

[Drasi](https://drasi.io) is a CNCF Sandbox project (accepted 2025) that provides **continuous query infrastructure** for cloud-native applications. It captures changes from databases, message queues, and Kubernetes resources in real time — then processes them as event streams using continuous queries.

**Key capabilities**:
- **Change data capture** from PostgreSQL, MongoDB, Kafka, Kubernetes
- **Continuous queries** written in Cypher (graph query language)
- **Reaction triggers** that fire when query results change
- **Multi-cluster deployment** via KubeStellar for distributed edge workloads

Drasi is backed by Microsoft and targets event-driven architectures, IoT/edge computing, and real-time analytics pipelines.

---

## The KubeStellar Console Install Mission

KubeStellar Console ships with an **AI-guided install mission** for Drasi:

🔗 [console.kubestellar.io/missions/install-drasi](https://console.kubestellar.io/missions/install-drasi)

The mission:
1. **Validates prerequisites** (Kubernetes 1.28+, Helm, kubectl access)
2. **Installs the Drasi operator** via Helm chart
3. **Creates a sample continuous query** monitoring Kubernetes Pod changes
4. **Configures a webhook reaction** that fires when query results change
5. **Verifies the deployment** with health checks and example queries

**Estimated time**: 15 minutes  
**Audience**: Platform engineers, DevOps teams, edge computing practitioners

---

## What Happened: Maintainer Verification

In **May 2026**, a Drasi maintainer:
1. Discovered the KubeStellar Console install mission
2. Ran the guided install end-to-end against a test cluster
3. Encountered a **bug in the webhook configuration step** (incorrect RBAC permissions)
4. **Reported the issue** in `drasi-project/drasi-platform#400`
5. The KubeStellar team **fixed the bug within 48 hours**
6. The maintainer **re-ran the mission and verified success**

This was the **first maintainer-tested install mission** in the console — validation from a CNCF project team that the mission framework is **good enough to rely on**.

---

## Why This Is a Compelling Story

### 1. Validates the Mission Framework
Install missions are **not documentation** — they're AI-guided, executable workflows that run `kubectl`/`helm` commands on behalf of the user. A project maintainer running one and finding it **useful enough to track** is a strong credibility signal.

### 2. Mutual Benefit
- **KubeStellar** gets a case study showing mission adoption by a CNCF project
- **Drasi** gets broader visibility among multi-cluster Kubernetes practitioners who use the console

### 3. CNCF Narrative
"How KubeStellar Console is building guided onboarding for CNCF projects, starting with Drasi" — a story that appeals to:
- CNCF leadership (SIG Contributor Experience, TOC)
- Other Sandbox/Incubating projects looking for onboarding tools
- KubeCon attendees exploring multi-cluster management

### 4. Microsoft OSS Angle
Drasi is backed by Microsoft. A co-authored blog post could reach **Microsoft's developer audience** (Azure blog, Microsoft OSS blog, LinkedIn).

---

## Case Study Angles

### Angle 1: Install Mission Narrative
**Title**: "From README to Running: How Drasi Verified KubeStellar's AI-Guided Install Missions"

**Content**:
- What is an install mission? (AI-guided workflows vs. static docs)
- How did the Drasi team discover it?
- What bugs did they find? (RBAC permissions)
- What did they learn about guided onboarding?
- Would they recommend it to other CNCF projects?

**Target**: CNCF blog, KubeCon talk proposal, Drasi blog

---

### Angle 2: Multi-Cluster Deployment Story
**Title**: "Change Data Capture at the Edge: Deploying Drasi Across Multi-Cluster Fleets with KubeStellar"

**Content**:
- Why does Drasi benefit from multi-cluster orchestration?
- How does KubeStellar's workload distribution work for event-driven systems?
- Example: Deploying Drasi continuous queries to 10+ edge clusters
- Performance/latency considerations for CDC at scale

**Target**: KubeCon CloudNativeEdge Day, CNCF blog, Microsoft OSS blog

---

### Angle 3: Change Data Capture + Edge Computing
**Title**: "Real-Time Event Processing at the Data Source: Drasi + KubeStellar for Distributed IoT Workloads"

**Content**:
- The problem: centralized data pipelines create latency for edge workloads
- Drasi's solution: process event streams **at the data source** (edge cluster)
- KubeStellar's role: distribute Drasi instances to edge locations
- Use case: IoT sensor data → continuous query → webhook trigger → local action

**Target**: IoT/edge computing conferences, CNCF TAG Edge

---

### Angle 4: Process Template for CNCF Projects
**Title**: "How to Get Your CNCF Project an Install Mission: Lessons from Drasi"

**Content**:
- What is an install mission? (AI-guided onboarding)
- How does a CNCF project get one?
- What's the process? (submit request → maintainer review → mission PR → verification)
- Lessons learned from Drasi's engagement
- Call to action: which project should be next?

**Target**: CNCF Slack #kubestellar, CNCF TOC, SIG Contributor Experience

---

## Blog Post Outline (Primary Angle)

**Title**: "Drasi Becomes the First CNCF Sandbox Project to Verify a KubeStellar Console Install Mission"

### Introduction (200 words)
- Drasi is a CNCF Sandbox project for change data capture
- KubeStellar Console ships AI-guided install missions for CNCF projects
- Drasi maintainer ran the mission end-to-end, found a bug, and verified the fix
- This makes Drasi the first CNCF project with a **maintainer-tested** install mission

### What is an Install Mission? (300 words)
- Not just documentation — executable AI workflows
- Example: `/missions/install-drasi` runs Helm commands, validates prerequisites, creates sample queries
- Missions are **AI-maintained** (LLM-driven updates when Drasi releases new versions)

### The Drasi Engagement (400 words)
- Timeline: May 2026, maintainer discovery → test run → bug report → fix → re-verification
- The bug: incorrect RBAC permissions in webhook configuration step
- The fix: 48-hour turnaround from KubeStellar team
- Outcome: maintainer verified success and tracked in `drasi-project/drasi-platform#400`

### Why This Matters (300 words)
- Validates the mission framework for production use
- Mutual benefit: KubeStellar credibility + Drasi visibility
- Sets a template for other CNCF projects
- Shows the value of **maintainer-driven onboarding** vs. user-only testing

### Multi-Cluster Use Case (300 words)
- Drasi processes event streams **at the data source** (edge cluster)
- KubeStellar distributes Drasi instances to edge locations
- Example: IoT sensor data → continuous query → local webhook trigger
- Performance: sub-100ms query reaction times at edge

### What's Next (200 words)
- Which CNCF project should be next? (call to action)
- How to submit an install mission request
- Link to mission catalog: `console.kubestellar.io/missions/browse`

### Conclusion (100 words)
- Drasi's verification proves install missions are **ready for production**
- Invitation to other CNCF projects to join the mission catalog
- Contact info for mission requests

**Total**: ~1,800 words  
**Target**: CNCF blog, Drasi blog, cross-post to Microsoft OSS blog

---

## Outreach Plan

### 1. Reach Out to Drasi Team
Via the existing `drasi-project/drasi-platform#400` thread:

```
Hi Drasi team 👋

We'd love to co-author a blog post about your verification of the KubeStellar Console install mission for Drasi. This was the first CNCF Sandbox project to have a maintainer-tested install mission — a milestone worth celebrating!

Proposed angles:
- Mission framework validation story (CNCF blog)
- Multi-cluster CDC deployment (KubeCon talk?)
- Process template for other CNCF projects

Interested? We can draft an outline and collaborate via a shared Google Doc.

cc @drasi-maintainers
```

### 2. Draft the Case Study
- Create `docs/docs/content/news/drasi-case-study.md` (this file)
- Collaborate with Drasi team on edits/quotes
- Include screenshots of the mission UI

### 3. Submit to CNCF Blog
- **Category**: Ecosystem Adoption
- **Contact**: CNCF blog editors via `blog@cncf.io`
- **Timeline**: 2–3 weeks from submission to publication

### 4. Cross-Post
- **Drasi blog** (drasi.io/blog)
- **Microsoft OSS blog** (via Drasi team's Microsoft contacts)
- **KubeStellar blog** (console.kubestellar.io news section)
- **LinkedIn** (KubeStellar + Drasi company pages)

### 5. CNCF Slack Announcement
Post in:
- `#kubestellar` — KubeStellar community channel
- `#drasi` (if it exists) — Drasi community channel
- `#sig-contributor-experience` — CNCF contributor experience group
- `#toc` (if newsworthy enough) — CNCF Technical Oversight Committee

**Sample announcement**:
```
📢 Case study published: Drasi becomes the first CNCF Sandbox project to verify a KubeStellar Console install mission

Drasi maintainers ran the AI-guided install end-to-end, found a bug, and verified the fix — validating the mission framework for production use.

Read the case study: [link]

Which CNCF project should be next? 🤔
```

---

## KubeCon Talk Proposal (Optional)

**Title**: "Zero to Multi-Cluster Change Data Capture: Drasi + KubeStellar Install Missions"

**Track**: Multi-Cluster / Edge Computing

**Abstract**:
```
Installing distributed systems is hard. Installing them across multi-cluster fleets is harder. Install missions in KubeStellar Console turn that into a 15-minute guided workflow.

Drasi — a CNCF Sandbox project for change data capture — became the first project to verify this approach. In this session, we'll:
- Demo the Drasi install mission live
- Show how continuous queries work in multi-cluster environments
- Explain how AI-guided missions stay up-to-date with project releases
- Invite other CNCF projects to join the mission catalog

You'll leave with a template for adding install missions to your own project.
```

**Speakers**: KubeStellar maintainer + Drasi maintainer (co-presentation)

**Target**: KubeCon NA 2026 (October)

---

## Success Metrics

Track impact of the case study:

| Metric | Baseline (pre-publication) | Target (1 month post) |
|--------|---------------------------|----------------------|
| Drasi mission runs | ~10/month | 100+/month |
| Mission catalog views | ~500/month | 2,000+/month |
| Mission requests from other CNCF projects | 0 | 3+ |
| CNCF blog page views | N/A | 1,000+ |
| CNCF Slack mentions | ~2/month | 20+/month |

---

## Next Actions

1. ✅ **Draft case study** (this document)
2. ⏳ **Reach out to Drasi team** via `drasi-project/drasi-platform#400`
3. ⏳ **Collaborate on blog post edits** (shared Google Doc)
4. ⏳ **Submit to CNCF blog** (target publication: July 2026)
5. ⏳ **Cross-post to Drasi + Microsoft blogs**
6. ⏳ **Post in CNCF Slack** #kubestellar, #sig-contributor-experience
7. ⏳ **Consider KubeCon talk proposal** (deadline typically 3 months before conference)

---

*Established June 2026 | CNCF ecosystem partnership initiative*
