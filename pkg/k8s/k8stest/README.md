# k8stest — Mock Infrastructure for Kubernetes Client Testing

This package provides test helpers for writing unit tests against `pkg/k8s`
without requiring a real Kubernetes cluster connection.

## Problem

Tests in `pkg/k8s` were failing when run in CI environments without full cluster
RBAC permissions because they attempted to use **real in-cluster kubeconfig** when
`KUBERNETES_SERVICE_HOST` was detected.

Error pattern:
```
Using in-cluster config (no kubeconfig file found)
gateways.gateway.networking.k8s.io is forbidden: User "system:serviceaccount:..."
cannot list resource
```

## Solution

The `k8stest` package provides:

1. **FakeMultiClusterSetup** — Test-friendly MultiClusterClient configuration
2. **Mock client builders** — Pre-configured fake clients for common scenarios
3. **Resource builders** — Helpers to create nodes, pods, and other resources
4. **GVR mapping** — Comprehensive GVR-to-ListKind map for dynamic clients

## Usage

### Basic Setup

```go
import "github.com/kubestellar/console/pkg/k8s/k8stest"

func TestMyFeature(t *testing.T) {
    // Create a test setup
    setup := k8stest.NewFakeMultiClusterSetup()
    
    // Add fake clusters
    setup.InjectTestClusters("c1", "c2")
    
    // Add a fake client with nodes
    node := k8stest.NewHealthyNode("node1", 4, 16) // 4 cores, 16 GiB
    setup.SetFakeClient("c1", k8stest.NewFakeClientWithNodes(node))
    
    // Create your MultiClusterClient and inject the test configuration
    m, _ := NewMultiClusterClient("")
    m.clients = setup.Clients
    m.rawConfig = setup.RawConfig
    
    // Run your test
    health, err := m.GetClusterHealth(context.Background(), "c1")
    // ... assertions
}
```

### RBAC Permission Tests

```go
func TestPermissions(t *testing.T) {
    setup := k8stest.NewFakeMultiClusterSetup()
    
    // Create a client that allows all RBAC checks
    setup.SetFakeClient("admin-cluster", k8stest.NewFakeClientAllowAll())
    
    // Create a client that denies all RBAC checks
    setup.SetFakeClient("restricted-cluster", k8stest.NewFakeClientDenyAll())
    
    // Test your permission logic
}
```

### Dynamic Client Tests (Gateway API, etc.)

```go
func TestGatewayList(t *testing.T) {
    setup := k8stest.NewFakeMultiClusterSetup()
    
    // Create a fake dynamic client with a gateway object
    gateway := &unstructured.Unstructured{...}
    fakeDyn := k8stest.NewFakeDynamicClient(gateway)
    
    setup.SetFakeDynamicClient("c1", fakeDyn)
    
    // Test your gateway listing logic
}
```

### Node/Pod Builders

```go
// Healthy node with resources
node := k8stest.NewHealthyNode("node1", 8, 32) // 8 cores, 32 GiB

// Running pod
pod := k8stest.NewRunningPod("pod1", "default")

// Create fake client with resources
fc := k8stest.NewFakeClientWithNodes(node)
fc2 := k8stest.NewFakeClientWithPods(pod)
```

## Integration Tests

For tests that **require a real cluster**, use environment variable gating:

```go
import "os"

func TestRealCluster(t *testing.T) {
    if os.Getenv("KC_INTEGRATION_TESTS") != "1" {
        t.Skip("Integration test — set KC_INTEGRATION_TESTS=1 to run")
    }
    
    // Real cluster test code
}
```

Run integration tests with:
```bash
KC_INTEGRATION_TESTS=1 go test ./pkg/k8s/...
```

## API Reference

### FakeMultiClusterSetup

- **NewFakeMultiClusterSetup()** — Creates empty test configuration
- **SetFakeClient(name, client)** — Injects a fake typed client
- **SetFakeDynamicClient(name, client)** — Injects a fake dynamic client
- **InjectTestClusters(names...)** — Adds minimal kubeconfig entries

### Mock Client Builders

- **NewFakeClientWithNodes(nodes...)** — Fake client with pre-populated nodes
- **NewFakeClientWithPods(pods...)** — Fake client with pre-populated pods
- **NewFakeClientAllowAll()** — Client that allows all RBAC checks
- **NewFakeClientDenyAll()** — Client that denies all RBAC checks

### Resource Builders

- **NewHealthyNode(name, cpuCores, memoryGiB)** — Node with Ready condition
- **NewRunningPod(name, namespace)** — Pod in Running phase

### Dynamic Client Helpers

- **BuildGVRMap()** — Standard GVR-to-ListKind map (includes Gateway API)
- **NewFakeDynamicClient(objects...)** — Fake dynamic client with GVR map

### Test Utilities

- **TestContextWithDeadline()** — Context with 10-second timeout

## Migration Guide

**Before (real kubeconfig dependency):**
```go
func TestOldWay(t *testing.T) {
    m, _ := NewMultiClusterClient("")  // Tries in-cluster config if available
    // Test fails in CI without cluster RBAC
}
```

**After (isolated unit test):**
```go
func TestNewWay(t *testing.T) {
    setup := k8stest.NewFakeMultiClusterSetup()
    setup.SetFakeClient("c1", k8sfake.NewSimpleClientset())
    
    m, _ := NewMultiClusterClient("")
    m.clients = setup.Clients
    m.rawConfig = setup.RawConfig
    
    // Test runs without cluster dependency
}
```

## Design Rationale

1. **No reflection** — Uses exported fields only (Clients, DynamicClients, RawConfig)
2. **Minimal coupling** — Doesn't depend on MultiClusterClient internals
3. **Reusable** — Common patterns extracted into builders
4. **Comprehensive** — Covers RBAC, health, gateway API, and more

## Related

- **test_helpers_test.go** — Legacy helpers (injectTestClusters, buildTestGVRMap)
  still used by existing tests, now wrapped by k8stest package
- **PR #17919** — Integration test gating (separate from mock infrastructure)
- **Issue #17895** — Original quality report requesting this infrastructure
