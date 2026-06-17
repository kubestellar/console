# CNCF Readiness: Sandbox Application & Incubation Planning

> Preparing KubeStellar Console for CNCF Sandbox application and long-term incubation.

## CNCF Sandbox Application Readiness (Issue #18773)

### Required Criteria

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Open source license | ✅ | Apache 2.0 |
| Hosted on GitHub | ✅ | github.com/kubestellar/console |
| Active maintainers (2+) | ✅ | @clubanderson + community |
| Adopters in production | ⚠️ | ADOPTERS.md needs expansion |
| CII Best Practices badge | ❌ | Need to apply |
| Security policy | ✅ | SECURITY.md exists |
| Code of Conduct | ✅ | CODE_OF_CONDUCT.md |
| Contribution guidelines | ✅ | CONTRIBUTING.md |
| Governance document | ⚠️ | Needs formal GOVERNANCE.md |

### Action Items for Sandbox Application
- [ ] Apply for CII Best Practices badge (OpenSSF)
- [ ] Write formal GOVERNANCE.md (decision-making process, maintainer ladder)
- [ ] Expand ADOPTERS.md with 3+ production users (see First Adopter Program)
- [ ] Prepare 2-minute pitch deck for TOC presentation
- [ ] File CNCF Sandbox application via cncf.io/sandbox
- [ ] Identify 2 TOC sponsors

### ADOPTERS.md Requirements
CNCF expects demonstrable adoption. Each entry should include:
- Organization name (or anonymized industry vertical)
- Use case description
- Scale (clusters, users, environments)
- Quote from engineering lead (optional but powerful)

---

## CNCF Incubation Planning — Q4 2026 (Issue #18783)

### Incubation Requirements (Beyond Sandbox)

| Criterion | Status | Gap |
|-----------|--------|-----|
| Production usage (3+ orgs) | ⚠️ | Need 3 documented adopters |
| Healthy contribution rate | ✅ | Active PRs from multiple contributors |
| Clear governance | ⚠️ | Need GOVERNANCE.md |
| Security audit | ❌ | Need CNCF-funded audit |
| Technical due diligence | ❌ | Prepare DD document |
| Defined scope and roadmap | ✅ | V04-MILESTONE-SCOPE.md exists |
| Documented architecture | ✅ | ARCHITECTURE.md + stellar/architecture.md |

### Community Evidence Assembly

**Quantitative Metrics:**
| Metric | Current | Target for Incubation |
|--------|---------|----------------------|
| GitHub stars | 117 | 300+ |
| Contributors (unique) | ~10 | 25+ |
| Forks | 119 | 200+ |
| Monthly active contributors | ~5 | 10+ |
| Production adopters | 1 | 5+ |
| CNCF project integrations | 313 cards | 313+ (maintain) |

**Qualitative Evidence:**
- [ ] 3+ case studies (1-page each) from production users
- [ ] Conference talks referencing the project (KubeCon, GitOpsCon)
- [ ] Blog posts from non-maintainer community members
- [ ] Integration partnerships (ArgoCD, Crossplane, Kagenti)
- [ ] Ecosystem projects built on top (console-marketplace, console-kb)

### Timeline to Incubation Application

| Phase | Timeline | Actions |
|-------|----------|---------|
| Q3 2026 | Now | Sandbox application, grow adopters |
| Q4 2026 | Oct-Dec | File incubation, security audit |
| Q1 2027 | Jan-Mar | TOC review, due diligence |

---

## 313-Card CNCF Ecosystem Milestone (Issue #18813)

### Achievement
The console integrates with **313 CNCF ecosystem projects** via dashboard cards. This is a significant community signal.

### Engagement Strategy for Individual Project Communities

#### Tier 1: Graduated Projects (highest visibility)
- Kubernetes, Prometheus, Envoy, CoreDNS, containerd
- Fluentd, Jaeger, Vitess, TUF, Helm
- Harbor, Rook, etcd, OPA, Argo, Flux

**Action**: Post in each project's Slack/Discord: "KubeStellar Console ships a {project} observability card — feedback welcome"

#### Tier 2: Incubating Projects (partnership potential)
- Crossplane, Dapr, WasmCloud, Karmada, Backstage
- Knative, KEDA, Thanos, Cilium

**Action**: File GitHub issue in their repo offering integration showcase

#### Tier 3: Sandbox Projects (community building)
- Drasi, KubeStellar itself, newer projects

**Action**: Joint blog posts, co-presentations at CNCF meetups

### Messaging Template

> "KubeStellar Console (CNCF ecosystem) ships an observability card for {project}.
> We monitor {specific metrics/resources} across multi-cluster deployments.
> Would love feedback from {project} maintainers on what metrics matter most.
> Try it: console.kubestellar.io (zero-install demo mode)"

### Success Metrics
| Metric | Target (90 days) |
|--------|-----------------|
| Project communities contacted | 20 |
| Responses/engagement | 10 |
| Co-authored content pieces | 3 |
| New GitHub stars from outreach | 50 |

## Related

- [COMMUNITY.md](../COMMUNITY.md)
- [ADOPTERS.md](../../ADOPTERS.md)
- [Community Signal Analysis](./community-signal-analysis.md)
- [Security Self-Assessment](../security/SELF-ASSESSMENT.md)
