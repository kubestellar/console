package mcp

// demo_bridge.go provides package-level aliases that make exported functions
// from the parent handlers package callable without a package qualifier inside
// the mcp package. This avoids repeating "handlers." throughout handler code
// and keeps the call sites identical to how they looked before the mcp
// extraction (#18122).

import (
	"context"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/apis/v1alpha1"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

// handleK8sError is a local alias for handlers.HandleK8sError.
var handleK8sError = handlers.HandleK8sError

// demoResponse is a local alias for handlers.DemoResponse.
// cluster.go and other mcp files call this without a package qualifier.
func demoResponse(c *fiber.Ctx, key string, data interface{}) error {
	return handlers.DemoResponse(c, key, data)
}

// requireEditorOrAdmin and requireViewerOrAbove are auth helpers used in
// resources.go, custom_resources.go, and drasi_proxy.go without qualification.
func requireEditorOrAdmin(c *fiber.Ctx, s store.Store) error {
	return handlers.RequireEditorOrAdmin(c, s)
}

func requireViewerOrAbove(c *fiber.Ctx, s store.Store) error {
	return handlers.RequireViewerOrAbove(c, s)
}

// isValidK8sName and isValidK8sVersion are validation helpers used in
// custom_resources.go without qualification.
func isValidK8sName(name string) bool    { return handlers.IsValidK8sName(name) }
func isValidK8sVersion(v string) bool    { return handlers.IsValidK8sVersion(v) }

// Demo-data aliases — each forwards to the canonical implementation in
// handlers/demo_data.go so that mcp handler files can call getDemoXxx()
// without qualification, just as they did before the package split.

func getDemoClusters() []k8s.ClusterInfo                      { return handlers.GetDemoClusters() }
func getDemoClusterHealth(cluster string) *k8s.ClusterHealth   { return handlers.GetDemoClusterHealth(cluster) }
func getDemoAllClusterHealth() []k8s.ClusterHealth             { return handlers.GetDemoAllClusterHealth() }
func getDemoNodes() []k8s.NodeInfo                             { return handlers.GetDemoNodes() }
func getDemoEvents() []k8s.Event                               { return handlers.GetDemoEvents() }
func getDemoWarningEvents() []k8s.Event                        { return handlers.GetDemoWarningEvents() }
func getDemoSecurityIssues() []k8s.SecurityIssue               { return handlers.GetDemoSecurityIssues() }
func getDemoGPUNodes() []k8s.GPUNode                           { return handlers.GetDemoGPUNodes() }
func getDemoGPUNodeHealth() []k8s.GPUNodeHealthStatus          { return handlers.GetDemoGPUNodeHealth() }
func getDemoNVIDIAOperatorStatus() []*k8s.NVIDIAOperatorStatus { return handlers.GetDemoNVIDIAOperatorStatus() }
func getDemoPodLogs() string                                   { return handlers.GetDemoPodLogs() }
func getDemoPods() []k8s.PodInfo                               { return handlers.GetDemoPods() }
func getDemoPodIssues() []k8s.PodIssue                         { return handlers.GetDemoPodIssues() }
func getDemoServices() []k8s.Service                           { return handlers.GetDemoServices() }
func getDemoServiceAccounts() []k8s.ServiceAccount             { return handlers.GetDemoServiceAccounts() }
func getDemoWorkloads() []v1alpha1.Workload                     { return handlers.GetDemoWorkloads() }
func getDemoConfigMaps() []k8s.ConfigMap                       { return handlers.GetDemoConfigMaps() }
func getDemoSecrets() []k8s.Secret                             { return handlers.GetDemoSecrets() }

// Compile-time check: context is used in listClusterResources via helpers.go.
var _ = context.Background

func getDemoDeployments() []k8s.Deployment          { return handlers.GetDemoDeployments() }
func getDemoDeploymentIssues() []k8s.DeploymentIssue { return handlers.GetDemoDeploymentIssues() }
func getDemoJobs() []k8s.Job                         { return handlers.GetDemoJobs() }
func getDemoHPAs() []k8s.HPA                         { return handlers.GetDemoHPAs() }
func getDemoPVCs() []k8s.PVC                         { return handlers.GetDemoPVCs() }
func getDemoPVs() []k8s.PV                           { return handlers.GetDemoPVs() }
func getDemoResourceQuotas() []k8s.ResourceQuota     { return handlers.GetDemoResourceQuotas() }
func getDemoLimitRanges() []k8s.LimitRange           { return handlers.GetDemoLimitRanges() }
func getDemoReplicaSets() []k8s.ReplicaSet           { return handlers.GetDemoReplicaSets() }
func getDemoStatefulSets() []k8s.StatefulSet         { return handlers.GetDemoStatefulSets() }
func getDemoDaemonSets() []k8s.DaemonSet             { return handlers.GetDemoDaemonSets() }
func getDemoCronJobs() []k8s.CronJob                 { return handlers.GetDemoCronJobs() }
func getDemoIngresses() []k8s.Ingress                { return handlers.GetDemoIngresses() }
func getDemoNetworkPolicies() []k8s.NetworkPolicy    { return handlers.GetDemoNetworkPolicies() }
func getDemoFlatcarNodes() []k8s.FlatcarNodeInfo     { return handlers.GetDemoFlatcarNodes() }
func getWasmCloudHosts() []fiber.Map                 { return handlers.GetWasmCloudHosts() }
func getWasmCloudActors() []fiber.Map                { return handlers.GetWasmCloudActors() }

// SSE cache and fetch-group bridges — allow sse_transport.go to use the shared
// cache maintained by the parent handlers package without qualification.
func sseCacheGet(key string) interface{} { return handlers.SSECacheGet(key) }
func sseCacheSet(key string, data interface{}) { handlers.SSECacheSet(key, data) }

// sseFetchGroupDo is a var so sse_transport.go can call sseFetchGroup.Do(...).
// We expose it as a plain function with the same signature.
type sseFetchGroupShim struct{}

func (sseFetchGroupShim) Do(key string, fn func() (interface{}, error)) (interface{}, error, bool) {
	return handlers.SSEFetchGroupDo(key, fn)
}

var sseFetchGroup sseFetchGroupShim
