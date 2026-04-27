package api

import (
"github.com/gofiber/fiber/v2"

"github.com/kubestellar/console/pkg/api/handlers"
)

// setupMCPRoutes registers all /mcp/* routes including SSE streaming
// variants and the /drasi/proxy/* reverse proxy. The namespaces handler
// is shared with setupRoutes for the /api/namespaces endpoint.
func (s *Server) setupMCPRoutes(api fiber.Router, namespaces *handlers.NamespaceHandler) {
// MCP handlers (cluster operations via kubestellar tools and direct k8s)
mcpHandlers := handlers.NewMCPHandlers(s.bridge, s.k8sClient, s.store)

// MCP routes — SECURITY: All MCP routes require authentication
api.Get("/mcp/status", mcpHandlers.GetStatus)
api.Get("/mcp/tools/ops", mcpHandlers.GetOpsTools)
api.Get("/mcp/tools/deploy", mcpHandlers.GetDeployTools)
api.Get("/mcp/clusters", mcpHandlers.ListClusters)
api.Get("/mcp/clusters/health", mcpHandlers.GetAllClusterHealth)
api.Get("/mcp/clusters/:cluster/health", mcpHandlers.GetClusterHealth)
api.Get("/mcp/pods", mcpHandlers.GetPods)
api.Get("/mcp/pod-issues", mcpHandlers.FindPodIssues)
api.Get("/mcp/deployment-issues", mcpHandlers.FindDeploymentIssues)
api.Get("/mcp/deployments", mcpHandlers.GetDeployments)
api.Get("/mcp/gpu-nodes", mcpHandlers.GetGPUNodes)
api.Get("/mcp/gpu-nodes/health", mcpHandlers.GetGPUNodeHealth)
api.Get("/mcp/gpu-nodes/health/cronjob", mcpHandlers.GetGPUHealthCronJobStatus)
// POST and DELETE /mcp/gpu-nodes/health/cronjob moved to kc-agent
// (#7993 Phase 3e). The agent exposes /gpu-health-cronjob with the same
// body shape, running under the user's kubeconfig.
api.Get("/mcp/gpu-nodes/health/cronjob/results", mcpHandlers.GetGPUHealthCronJobResults)
api.Get("/mcp/nvidia-operators", mcpHandlers.GetNVIDIAOperatorStatus)
api.Get("/mcp/nodes", mcpHandlers.GetNodes)
api.Get("/mcp/flatcar/nodes", mcpHandlers.GetFlatcarNodes)
api.Get("/mcp/events", mcpHandlers.GetEvents)
api.Get("/mcp/events/warnings", mcpHandlers.GetWarningEvents)
api.Get("/mcp/security-issues", mcpHandlers.CheckSecurityIssues)
api.Get("/mcp/services", mcpHandlers.GetServices)
api.Get("/mcp/jobs", mcpHandlers.GetJobs)
api.Get("/mcp/hpas", mcpHandlers.GetHPAs)
api.Get("/mcp/configmaps", mcpHandlers.GetConfigMaps)
api.Get("/mcp/secrets", mcpHandlers.GetSecrets)
api.Get("/mcp/serviceaccounts", mcpHandlers.GetServiceAccounts)
api.Get("/mcp/pvcs", mcpHandlers.GetPVCs)
api.Get("/mcp/pvs", mcpHandlers.GetPVs)
api.Get("/mcp/resourcequotas", mcpHandlers.GetResourceQuotas)
api.Post("/mcp/resourcequotas", mcpHandlers.CreateOrUpdateResourceQuota)
api.Delete("/mcp/resourcequotas", mcpHandlers.DeleteResourceQuota)
api.Get("/mcp/limitranges", mcpHandlers.GetLimitRanges)
api.Get("/mcp/pods/logs", mcpHandlers.GetPodLogs)
api.Post("/mcp/tools/ops/call", mcpHandlers.CallOpsTool)
api.Post("/mcp/tools/deploy/call", mcpHandlers.CallDeployTool)
api.Get("/mcp/wasmcloud/hosts", mcpHandlers.GetWasmCloudHosts)
api.Get("/mcp/wasmcloud/actors", mcpHandlers.GetWasmCloudActors)
api.Get("/mcp/custom-resources", mcpHandlers.GetCustomResources)
// Drasi reverse proxy — forwards to drasi-server (mode 1+2) or drasi-platform
// (mode 3) so the `/drasi` dashboard speaks the same client code to either.
// See pkg/api/handlers/drasi_proxy.go for the protocol detection contract.
api.All("/drasi/proxy/*", mcpHandlers.ProxyDrasi)
api.Get("/mcp/replicasets", mcpHandlers.GetReplicaSets)
api.Get("/mcp/statefulsets", mcpHandlers.GetStatefulSets)
api.Get("/mcp/daemonsets", mcpHandlers.GetDaemonSets)
api.Get("/mcp/cronjobs", mcpHandlers.GetCronJobs)
api.Get("/mcp/ingresses", mcpHandlers.GetIngresses)
api.Get("/mcp/networkpolicies", mcpHandlers.GetNetworkPolicies)
api.Get("/mcp/pod-network-stats", mcpHandlers.GetPodNetworkStats)
api.Get("/mcp/resource-yaml", mcpHandlers.GetResourceYAML)

// Widget-friendly aliases — the widget registry references these shorter
// paths.  Without explicit routes they fall through to the SPA catch-all
// which returns index.html (HTTP 307), breaking exported widgets.
// See: #4140, #4141, #4142
api.Get("/mcp/workloads", mcpHandlers.GetWorkloads)
api.Get("/mcp/security", mcpHandlers.CheckSecurityIssues)
api.Get("/mcp/storage", mcpHandlers.GetPVCs)
api.Get("/mcp/network", mcpHandlers.GetNetworkPolicies)
api.Get("/mcp/namespaces", namespaces.ListNamespaces)

// SSE streaming variants — stream per-cluster results as they arrive
api.Get("/mcp/pods/stream", mcpHandlers.GetPodsStream)
api.Get("/mcp/pod-issues/stream", mcpHandlers.FindPodIssuesStream)
api.Get("/mcp/deployment-issues/stream", mcpHandlers.FindDeploymentIssuesStream)
api.Get("/mcp/deployments/stream", mcpHandlers.GetDeploymentsStream)
api.Get("/mcp/events/stream", mcpHandlers.GetEventsStream)
api.Get("/mcp/services/stream", mcpHandlers.GetServicesStream)
api.Get("/mcp/security-issues/stream", mcpHandlers.CheckSecurityIssuesStream)
api.Get("/mcp/nodes/stream", mcpHandlers.GetNodesStream)
api.Get("/mcp/gpu-nodes/stream", mcpHandlers.GetGPUNodesStream)
api.Get("/mcp/gpu-nodes/health/stream", mcpHandlers.GetGPUNodeHealthStream)
api.Get("/mcp/events/warnings/stream", mcpHandlers.GetWarningEventsStream)
api.Get("/mcp/jobs/stream", mcpHandlers.GetJobsStream)
api.Get("/mcp/configmaps/stream", mcpHandlers.GetConfigMapsStream)
api.Get("/mcp/secrets/stream", mcpHandlers.GetSecretsStream)
api.Get("/mcp/nvidia-operators/stream", mcpHandlers.GetNVIDIAOperatorStatusStream)
api.Get("/mcp/workloads/stream", mcpHandlers.GetWorkloadsStream)
}
