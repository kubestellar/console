# KubeStellar Console Adopters

This document tracks public adopter evidence for KubeStellar Console in a CNCF-friendly format. It distinguishes between:

1. **Reference deployments** maintained by the project,
2. **Production adopters** willing to be named publicly,
3. **Evaluation / pilot adopters**, and
4. **Ecosystem integrations and install-mission adopters** with public evidence.

KubeStellar Console maintainers will preserve all valid entries when restructuring this file. Contributors adding new entries should include a public reference link whenever possible.

## What CNCF reviewers should expect here

For CNCF due diligence, the strongest entries are organizations willing to be listed publicly with:

- a short description of how they use KubeStellar Console,
- the deployment stage (`production`, `pilot`, `evaluation`, or `ecosystem integration`), and
- a verifiable public reference such as a case study, issue, pull request, mission page, or blog post.

## How to Add Yourself

1. Fork this repository.
2. Add your organization to the appropriate section below.
3. Use this schema: `| Organization | Deployment stage | Console use case | Public evidence | Notes |`
4. Open a pull request titled `📖 docs: add <Organization> to ADOPTERS.md`.

## 1. Project-hosted Reference Deployment

| Organization | Deployment stage | Console use case | Public evidence | Notes |
| --- | --- | --- | --- | --- |
| KubeStellar | Reference deployment | Hosted console UI, mission catalog, and community demonstration environment | [console.kubestellar.io](https://console.kubestellar.io) · [kubestellar.io](https://kubestellar.io) | Maintainer-operated reference environment; not counted as an external adopter |

## 2. Public Production Adopters

The project is actively collecting named production references for CNCF due diligence.

| Organization | Deployment stage | Console use case | Public evidence | Notes |
| --- | --- | --- | --- | --- |
| _Seeking public production references_ | — | Outreach is tracked in [#18783](https://github.com/kubestellar/console/issues/18783) | — | Add named production users here once permission is granted |

## 3. Public Pilot / Evaluation Adopters

Use this section for organizations that are evaluating, piloting, or testing KubeStellar Console in their own environments and are comfortable being named publicly.

| Organization | Deployment stage | Console use case | Public evidence | Notes |
| --- | --- | --- | --- | --- |
| _Seeking public pilot references_ | — | Outreach is tracked in [#18773](https://github.com/kubestellar/console/issues/18773) | — | Add named pilot or staging users here as they are confirmed |

## 4. Ecosystem Integrations and Install-Mission Adopters

These entries demonstrate real ecosystem engagement, install-mission usage, and public collaboration with upstream communities. They are valuable CNCF evidence, but they should be distinguished from named production operators.

| Organization / Project | Deployment stage | Console use case | Public evidence | Notes |
| --- | --- | --- | --- | --- |
| Open Cluster Management | Ecosystem integration | Guided install mission for OCM via KubeStellar Console | [OCM Install Mission](https://console.kubestellar.io/missions/install-open-cluster-management) | CNCF Sandbox project |
| Notary Project | Ecosystem integration | Guided install mission for Ratify with pre-flight checks, policy wiring, validation, troubleshooting, and rollback support | [Notary Project / Ratify](https://github.com/notaryproject/ratify) | CNCF Incubating project |
| OpenCost | Ecosystem integration | Guided install mission and upstream endorsement for OpenCost workflows | [OpenCost](https://opencost.io) · [opencost/opencost#3649](https://github.com/opencost/opencost/issues/3649) | CNCF Sandbox project |
| KitOps | Ecosystem integration | Guided install mission and upstream endorsement for KitOps | [KitOps](https://kitops.ml) · [kitops-ml/kitops#1115](https://github.com/kitops-ml/kitops/issues/1115) | CNCF Sandbox project |
| Cadence | Ecosystem integration | Guided install mission with public upstream engagement | [Cadence](https://cadenceworkflow.io) · [cadence-workflow/cadence#7830](https://github.com/cadence-workflow/cadence/issues/7830) | Non-CNCF project |
| Easegress | Ecosystem integration | Guided install mission with public upstream engagement | [Easegress](https://github.com/easegress-io/easegress) · [easegress-io/easegress#1510](https://github.com/easegress-io/easegress/issues/1510) | CNCF Sandbox project |
| Microcks | Ecosystem integration | Guided install mission with contribution into the Microcks community repo | [Microcks](https://microcks.io) · [microcks/community#125](https://github.com/microcks/community/pull/125) · [microcks/microcks#1997](https://github.com/microcks/microcks/issues/1997) | CNCF Sandbox project |
| kcp | Ecosystem integration | Guided install mission with maintainer engagement | [kcp](https://kcp.io) · [kcp-dev/kcp#3923](https://github.com/kcp-dev/kcp/issues/3923) | CNCF Sandbox project |
| kube-vip | Ecosystem integration | Guided install mission with upstream collaboration | [kube-vip](https://kube-vip.io) · [kube-vip/kube-vip#1472](https://github.com/kube-vip/kube-vip/issues/1472) | CNCF project |
| Submariner | Ecosystem integration | Guided install mission covering `subctl` broker, join, verify, and connectivity workflows | [Submariner](https://submariner.io) · [submariner-io/submariner#3907](https://github.com/submariner-io/submariner/issues/3907) | CNCF Sandbox project |
| Kmesh | Ecosystem integration | Guided install mission with public community engagement | [Kmesh](https://kmesh.net) · [kmesh-net/kmesh#1609](https://github.com/kmesh-net/kmesh/issues/1609) | CNCF Sandbox project |
| Drasi | Ecosystem integration | Guided install mission verified end-to-end by a Drasi maintainer | [drasi.io](https://drasi.io) · [drasi-project/drasi-platform#400](https://github.com/drasi-project/drasi-platform/issues/400) | CNCF Sandbox project |

## 5. Maintenance Notes

- Keep entries factual and publicly supportable.
- Do not label an organization as `production` without permission or a public reference.
- Preserve older evidence links when adding new detail.
- Cross-reference [docs/ADOPTION-METRICS.md](docs/ADOPTION-METRICS.md) and [docs/community/CNCF_READINESS.md](docs/community/CNCF_READINESS.md) when preparing CNCF applications.
