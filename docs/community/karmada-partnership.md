# Karmada Ecosystem Partnership

> Adjacent multi-cluster management — complementary positioning with KubeStellar.

## Overview

[Karmada](https://github.com/karmada-io/karmada) (CNCF Incubating, 4.5k+ ★) is a Kubernetes management system for multi-cluster and multi-cloud scenarios. While KubeStellar focuses on **edge computing and mailbox controller patterns**, Karmada focuses on **federation and propagation policies**.

## Complementary Positioning

| Dimension | KubeStellar | Karmada |
|-----------|-------------|---------|
| Focus | Edge + WDS (workload distribution) | Federation + propagation |
| Architecture | Mailbox controller | Push-based propagation |
| Observability | Console (this project) | Karmada Dashboard |
| AI Integration | Stellar + MCP bridge | Not yet |
| CNCF Status | Sandbox (pending) | Incubating |

## Integration Opportunity

The KubeStellar Console can observe Karmada-managed clusters through the same kubeconfig mechanism it uses for any Kubernetes cluster. The partnership is not competitive but additive:

1. **Karmada users** get AI-native observability for their federated clusters
2. **KubeStellar users** get federation capabilities for their edge deployments
3. **Both communities** benefit from shared CNCF multi-cluster standards

## Engagement Plan

### Phase 1: Awareness (Current)
- [ ] Document Karmada compatibility in console README
- [ ] Add Karmada to `docs/integrations/` with connection guide
- [ ] Cross-reference in CNCF landscape positioning

### Phase 2: Integration
- [ ] Karmada PropagationPolicy card in console dashboard
- [ ] Multi-cluster status aggregation from Karmada API
- [ ] Joint webinar: "Multi-Cluster Kubernetes: Edge vs Federation"

### Phase 3: Ecosystem
- [ ] Shared missions in console-kb for Karmada operators
- [ ] Conference co-presentation opportunity
- [ ] CNCF TAG Network collaboration on multi-cluster standards

## Community Outreach

**Target**: Karmada maintainers and active contributors
**Message**: "Your federated clusters, observed through AI-native lens"
**Channel**: GitHub issue/discussion, Karmada Slack, CNCF TAG meetings

## Related

- [Console Architecture](../../ARCHITECTURE.md)
- [Multi-Cluster Queries (Go patterns)](../../README.md)
