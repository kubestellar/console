# CNCF Project Partnerships: Crossplane, Dapr, and WasmCloud

> Engaging CNCF Graduated and Incubating projects whose users benefit from multi-cluster AI observability.

## Crossplane (CNCF Graduated, 9k+ ★)

### Integration Value
Crossplane users manage infrastructure as Kubernetes resources (XRDs, Compositions, Claims). The console provides:
- **Claim status visibility** across clusters
- **Composition health** — detect broken XRDs before users notice
- **Provider health** — monitor Crossplane provider pods (AWS, GCP, Azure)

### Engagement Plan
1. **Dashboard card**: `CrossplaneClaimsCard` showing XR status across clusters
2. **Mission**: "Audit Crossplane provider health across fleet"
3. **Blog post**: "Platform Engineering Observability: Crossplane + KubeStellar Console"
4. **Community**: Post in Crossplane Slack #general about multi-cluster XR visibility

### Card Spec (proposed)
```typescript
// CrossplaneClaimsCard — shows XR claim status across connected clusters
// Data source: kubectl get composite,claim --all-namespaces -o json
// Refresh: 30s (status category)
// Demo data: 5 claims across 3 clusters, mixed Ready/Pending/Failed
```

---

## Dapr (CNCF Graduated, 23k+ ★)

### Integration Value
Dapr sidecars run on every application pod. Multi-cluster Dapr deployments need:
- **Sidecar health** — detect injection failures across clusters
- **Component status** — state stores, pub/sub, bindings per cluster
- **Service invocation** — cross-cluster call latency and errors

### Engagement Plan
1. **Dashboard card**: `DaprSidecarHealthCard` showing injection status fleet-wide
2. **Mission**: "Verify Dapr component connectivity across multi-cluster deployment"
3. **Blog post**: "Multi-Cluster Dapr Observability with AI-Native Tooling"
4. **Community**: Dapr Discord #kubernetes channel

### Card Spec (proposed)
```typescript
// DaprSidecarHealthCard — shows sidecar injection status across clusters
// Data source: kubectl get pods -l dapr.io/enabled=true --all-namespaces
// Refresh: 30s
// Demo data: 12 pods across 4 clusters, 11 healthy + 1 injection failed
```

---

## WasmCloud (CNCF Incubating)

### Integration Value
WasmCloud deploys WebAssembly components across distributed lattices. Console provides:
- **Lattice visibility** — host and actor status across clouds
- **Component health** — running vs crashed actors
- **Link monitoring** — capability provider link status

### Engagement Plan
1. **Dashboard card**: `WasmCloudLatticeCard` showing actor/host topology
2. **Mission**: "Deploy WasmCloud actor across multi-cloud lattice"
3. **Blog post**: "Wasm Meets Multi-Cluster: Observing WasmCloud with KubeStellar"
4. **Community**: WasmCloud Slack, wasmCloud/wasmCloud discussions

### Card Spec (proposed)
```typescript
// WasmCloudLatticeCard — shows WasmCloud lattice topology
// Data source: wash get inventory (or K8s CRDs if using wasmCloud-operator)
// Refresh: 60s
// Demo data: 3 hosts, 8 actors, 5 providers across 2 clusters
```

---

## Shared Engagement Template

For each project partnership:

1. **Research** — Read their docs, understand their multi-cluster story
2. **Card** — Build a dashboard card showing their resources
3. **Mission** — Create a console-kb mission using their tools
4. **Content** — Joint blog post or conference talk
5. **Community** — Post in their channels with value-first messaging

## Priority Order

1. **Crossplane** — highest alignment (platform engineering + multi-cluster)
2. **Dapr** — largest community (23k stars, active Discord)
3. **WasmCloud** — emerging technology, early relationship building

## Related

- [ArgoCD Integration](../../integrations/argocd.md)
- [Flux Integration](../../integrations/flux.md)
- [Card Development Guide](../marketplace/card-development-guide.md)
