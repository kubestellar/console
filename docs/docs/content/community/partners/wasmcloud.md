# KubeStellar Console + WasmCloud Integration

**WasmCloud** is a CNCF Incubating project that enables building distributed applications with WebAssembly. The KubeStellar Console ships a WasmCloud card that surfaces actor/provider health, lattice status, and component metrics directly from your dashboard.

## About WasmCloud

[WasmCloud](https://wasmcloud.com) is a platform for writing portable business logic that can run anywhere from the edge to the cloud. As a CNCF Incubating project, WasmCloud is rapidly growing in the cloud-native WebAssembly space with an active community and enterprise adoption.

**Key Features:**
- Distributed actor model for WebAssembly components
- Provider-based capability system
- Multi-cloud and edge deployment support
- Strong security and isolation guarantees

## WasmCloud Card in KubeStellar Console

The WasmCloud status card displays:
- **Lattice Health**: Real-time status of your WasmCloud lattice
- **Actor Status**: Health and metrics for deployed actors
- **Provider Status**: Capability provider availability
- **Component Metrics**: Resource usage and performance data

This integration gives you multi-cluster visibility into your WasmCloud deployments, helping platform teams monitor WebAssembly workloads at scale.

## Get Started

1. **Install WasmCloud**: Follow the [WasmCloud installation guide](https://wasmcloud.com/docs/installation)
2. **Deploy to Kubernetes**: Use the [WasmCloud operator](https://github.com/wasmCloud/wasmcloud-operator) for Kubernetes deployments
3. **Connect to Console**: The KubeStellar Console auto-discovers WasmCloud lattices in connected clusters

## Resources

- [WasmCloud GitHub](https://github.com/wasmCloud/wasmCloud) (~2k stars)
- [WasmCloud Documentation](https://wasmcloud.com/docs)
- [CNCF Project Page](https://www.cncf.io/projects/wasmcloud/)
- [Community Slack](https://slack.wasmcloud.com/)

## Co-Promotion Opportunities

We're excited to collaborate with the WasmCloud community! If you're interested in:
- Joint blog posts or demos
- KubeCon co-presence
- Adding KubeStellar to the WasmCloud ecosystem showcase

Please reach out in the [KubeStellar Slack](https://cloud-native.slack.com/archives/C097094RZ3M) or open a discussion on the [WasmCloud repository](https://github.com/wasmCloud/wasmCloud/discussions).

---

*This integration is part of KubeStellar's commitment to supporting the cloud-native ecosystem and CNCF projects.*

<style type="text/css">
.centerImage {
    display: block;
    margin: auto;
}
</style>
