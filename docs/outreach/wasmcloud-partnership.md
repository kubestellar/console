# WasmCloud Partnership: CNCF Incubating Integration

## Executive Summary

WasmCloud is a CNCF incubating project (10k+ stars) for building distributed applications with WebAssembly. KubeStellar Console ships a **WasmCloud management card** for monitoring lattice health, actor deployments, and capability availability.

## WasmCloud Card Features

| Feature | Description |
|---------|-------------|
| Lattice Health | Status of connected hosts and providers |
| Actor Deployments | List of running actors with placement and status |
| Capability Providers | Connected providers (HTTP, database, message queue, etc.) |
| Host Resources | CPU, memory, and connections per host |
| Real-Time Events | Actor lifecycle, deployment failures, scaling events |

## Integration Points

### 1. KubeStellar Console Dashboard
- Native WasmCloud card in multi-cluster dashboard
- Real-time actor and capability provider monitoring
- Integration with ArgoCD for declarative GitOps deployment

### 2. Orbit Recurring Missions
- Nightly health checks for lattice connectivity
- Automated actor rebalancing across hosts
- Capacity planning: detect under-utilized hosts

### 3. LLM-d Monitoring
- AI agents detect and resolve WasmCloud actor failures
- Autonomous actor migration on host failures

## Co-Marketing

### Blog Post Series
1. "Observing Distributed Apps: WasmCloud + KubeStellar Console"
2. "Autonomous WASM App Operations with KubeStellar Orbit"

### Community Engagement
- Cross-reference in WasmCloud documentation
- Joint CNCF blog post
- Co-presented session at KubeCon (if accepted)

### Social Amplification
- @CloudNativeWasm + @KubeStellar co-tweets
- Highlight in CNCF newsletters

---

*Last updated: Q3 2026*