# Inspektor Gadget eBPF Security Integration

KubeStellar Console ships a **full Inspektor Gadget integration** with four specialized eBPF-powered cards for runtime security observability across your multi-cluster deployments.

## About Inspektor Gadget

[Inspektor Gadget](https://www.inspektor-gadget.io/) is a CNCF Sandbox project providing eBPF-based tools for runtime security and observability on Kubernetes. Maintained by Microsoft and the community, Inspektor Gadget enables security engineers to trace DNS queries, network packets, process execution, and security audit events at the kernel level across entire clusters.

## Console Integration

KubeStellar Console's Inspektor Gadget card suite provides:
- **SecurityAuditCard** — Real-time security audit findings via eBPF, surfacing policy violations and suspicious activities
- **DNSTraceCard** — Live DNS query tracing across pods, enabling visibility into service discovery and external communications
- **NetworkTraceCard** — Network packet tracing and flow analysis, tracking inter-pod and pod-to-external communications
- **ProcessTraceCard** — Process execution tracing, capturing all process creation events across clusters

This represents a unique **multi-cluster eBPF observability dashboard** — a single pane of glass for runtime security and network observability across fleets.

## Engagement Opportunities

- Open discussion on [Inspektor Gadget GitHub](https://github.com/inspektor-gadget/inspektor-gadget/discussions): "Console integration for multi-cluster eBPF observability"
- Submit to CNCF Security TAG for amplification
- Blog post: "eBPF Security at Scale: DNS, Network, Process + Security Audit across K8s clusters in KubeStellar Console"
- KubeCon NA 2026 co-demo with Inspektor Gadget maintainers

## More Information

- [Inspektor Gadget Project](https://www.inspektor-gadget.io/)
- [Inspektor Gadget GitHub](https://github.com/inspektor-gadget/inspektor-gadget)
- [KubeStellar Console](https://console.kubestellar.io/)
