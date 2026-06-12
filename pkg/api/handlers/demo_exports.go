package handlers

import (
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/apis/v1alpha1"
)

// DemoResponse is the exported wrapper of demoResponse, for use by sub-packages
// that import handlers (e.g. handlers/mcp) without creating an import cycle.
func DemoResponse(c *fiber.Ctx, key string, data interface{}) error {
	return demoResponse(c, key, data)
}

// The following exported wrappers expose internal demo-data generators so
// sub-packages (handlers/mcp, handlers/workloads) can call them without
// needing the parent package to import them back.

func GetDemoClusters() []k8s.ClusterInfo               { return getDemoClusters() }
func GetDemoClusterHealth(cluster string) *k8s.ClusterHealth { return getDemoClusterHealth(cluster) }
func GetDemoAllClusterHealth() []k8s.ClusterHealth       { return getDemoAllClusterHealth() }
func GetDemoNodes() []k8s.NodeInfo                       { return getDemoNodes() }
func GetDemoEvents() []k8s.Event                         { return getDemoEvents() }
func GetDemoWarningEvents() []k8s.Event                  { return getDemoWarningEvents() }
func GetDemoSecurityIssues() []k8s.SecurityIssue         { return getDemoSecurityIssues() }
func GetDemoGPUNodes() []k8s.GPUNode                     { return getDemoGPUNodes() }
func GetDemoGPUNodeHealth() []k8s.GPUNodeHealthStatus    { return getDemoGPUNodeHealth() }
func GetDemoNVIDIAOperatorStatus() []*k8s.NVIDIAOperatorStatus { return getDemoNVIDIAOperatorStatus() }
func GetDemoPodLogs() string                             { return getDemoPodLogs() }
func GetDemoPods() []k8s.PodInfo                         { return getDemoPods() }
func GetDemoPodIssues() []k8s.PodIssue                   { return getDemoPodIssues() }
func GetDemoServices() []k8s.Service                     { return getDemoServices() }
func GetDemoServiceAccounts() []k8s.ServiceAccount       { return getDemoServiceAccounts() }
func GetDemoWorkloads() []v1alpha1.Workload               { return getDemoWorkloads() }
func GetDemoConfigMaps() []k8s.ConfigMap                 { return getDemoConfigMaps() }
func GetDemoSecrets() []k8s.Secret                       { return getDemoSecrets() }
func GetDemoDeployments() []k8s.Deployment          { return getDemoDeployments() }
func GetDemoDeploymentIssues() []k8s.DeploymentIssue { return getDemoDeploymentIssues() }
func GetDemoJobs() []k8s.Job                         { return getDemoJobs() }
func GetDemoHPAs() []k8s.HPA                         { return getDemoHPAs() }
func GetDemoPVCs() []k8s.PVC                         { return getDemoPVCs() }
func GetDemoPVs() []k8s.PV                           { return getDemoPVs() }
func GetDemoResourceQuotas() []k8s.ResourceQuota     { return getDemoResourceQuotas() }
func GetDemoLimitRanges() []k8s.LimitRange           { return getDemoLimitRanges() }
func GetDemoReplicaSets() []k8s.ReplicaSet           { return getDemoReplicaSets() }
func GetDemoStatefulSets() []k8s.StatefulSet         { return getDemoStatefulSets() }
func GetDemoDaemonSets() []k8s.DaemonSet             { return getDemoDaemonSets() }
func GetDemoCronJobs() []k8s.CronJob                 { return getDemoCronJobs() }
func GetDemoIngresses() []k8s.Ingress                { return getDemoIngresses() }
func GetDemoNetworkPolicies() []k8s.NetworkPolicy    { return getDemoNetworkPolicies() }
func GetDemoFlatcarNodes() []k8s.FlatcarNodeInfo     { return getDemoFlatcarNodes() }
func GetWasmCloudHosts() []fiber.Map                 { return getWasmCloudHosts() }
func GetWasmCloudActors() []fiber.Map                { return getWasmCloudActors() }
