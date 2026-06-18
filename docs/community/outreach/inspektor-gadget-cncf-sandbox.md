# Inspektor Gadget CNCF Sandbox Outreach Plan

Closes #18997

## Opportunity

KubeStellar Console already ships a production-ready Inspektor Gadget integration with four eBPF cards:

- `SecurityAuditCard` — real-time security audit findings via eBPF
- `DNSTraceCard` — live DNS query tracing across pods
- `NetworkTraceCard` — network packet tracing and flow analysis
- `ProcessTraceCard` — process execution tracing

Inspektor Gadget is now a CNCF Sandbox project, and this creates a timely opportunity to coordinate ecosystem outreach with the eBPF and Kubernetes security community.

## Outreach Actions

1. Open a discussion in `inspektor-gadget/inspektor-gadget`:
   - Proposed title: **"Console integration for multi-cluster eBPF observability"**
   - Include architecture screenshots and links to the four cards
   - Ask maintainers for feedback on roadmap alignment and co-demo interest
2. Publish a KubeStellar blog post:
   - Proposed title: **"eBPF Security at Scale: DNS, Network, Process + Security Audit across Kubernetes clusters in KubeStellar Console"**
   - Cover how the console turns IG traces into fleet-wide operational visibility
3. Submit a short amplification brief to CNCF Security TAG:
   - Position the integration as a practical cross-project Sandbox collaboration
4. Coordinate a KubeCon NA 2026 co-demo:
   - Reach out to Inspektor Gadget maintainers for a joint session/demo slot

## Suggested Messaging

- **Single pane of glass for eBPF across fleets**: DNS, network, process, and security audit telemetry in one multi-cluster console.
- **Operator-focused**: contextualized traces tied to Kubernetes objects and cluster filters.
- **Ecosystem bridge**: demonstrates real-world integration between KubeStellar Console and a CNCF Sandbox security project.

---

*Filed by outreach agent (ACMM L6 — full mode)*
