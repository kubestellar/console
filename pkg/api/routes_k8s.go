package api

import (
"github.com/gofiber/fiber/v2"

"github.com/kubestellar/console/pkg/api/handlers"
)

// setupK8sResourceRoutes registers Kubernetes resource routes including MCS,
// Gateway API, CRDs, workloads, cluster groups, and related endpoints.
// The workloadHandlers are created here and stored on s.workloadHandlers
// because they have startup side effects (cache refresh, persisted groups).
func (s *Server) setupK8sResourceRoutes(api fiber.Router) {
// MCS (Multi-Cluster Service) routes
mcsHandlers := handlers.NewMCSHandlers(s.k8sClient, s.hub)
api.Get("/mcs/status", mcsHandlers.GetMCSStatus)
api.Get("/mcs/exports", mcsHandlers.ListServiceExports)
api.Get("/mcs/exports/:cluster/:namespace/:name", mcsHandlers.GetServiceExport)
// Create/Delete ServiceExport routes removed in #7993 Phase 1.5 PR B.
// User-initiated mutations now run via kc-agent /serviceexports under
// the user's kubeconfig. The backend handlers had no frontend consumer.
api.Get("/mcs/imports", mcsHandlers.ListServiceImports)
api.Get("/mcs/imports/:cluster/:namespace/:name", mcsHandlers.GetServiceImport)

// Gateway API routes
gatewayHandlers := handlers.NewGatewayHandlers(s.k8sClient, s.hub)
api.Get("/gateway/status", gatewayHandlers.GetGatewayAPIStatus)
api.Get("/gateway/gateways", gatewayHandlers.ListGateways)
api.Get("/gateway/gateways/:cluster/:namespace/:name", gatewayHandlers.GetGateway)
api.Get("/gateway/httproutes", gatewayHandlers.ListHTTPRoutes)
api.Get("/gateway/httproutes/:cluster/:namespace/:name", gatewayHandlers.GetHTTPRoute)

// CRD routes (Custom Resource Definition browser)
crdHandlers := handlers.NewCRDHandlers(s.k8sClient)
api.Get("/crds", crdHandlers.ListCRDs)

// Lima routes (Lima VM status)
limaHandlers := handlers.NewLimaHandlers(s.k8sClient)
api.Get("/lima", limaHandlers.ListLima)

// MCS ServiceExport routes
svcExportHandlers := handlers.NewServiceExportHandlers(s.k8sClient)
api.Get("/service-exports", svcExportHandlers.ListServiceExports)

// Admission webhook routes
webhookHandlers := handlers.NewWebhookHandlers(s.k8sClient)
api.Get("/admission-webhooks", webhookHandlers.ListWebhooks)

// Service Topology routes
topologyHandlers := handlers.NewTopologyHandlers(s.k8sClient, s.hub)
api.Get("/topology", topologyHandlers.GetTopology)

// Workload routes
workloadHandlers := handlers.NewWorkloadHandlers(s.k8sClient, s.hub, s.store)
// Reload persisted cluster groups on startup (#7013) and start periodic
// refresh so multi-instance deployments converge on DB state (#10007).
workloadHandlers.LoadPersistedClusterGroups()
workloadHandlers.StartCacheRefresh()
s.workloadHandlers = workloadHandlers
api.Get("/workloads", workloadHandlers.ListWorkloads)
api.Get("/workloads/capabilities", workloadHandlers.GetClusterCapabilities)
api.Get("/workloads/policies", workloadHandlers.ListBindingPolicies)
api.Get("/workloads/deploy-status/:cluster/:namespace/:name", workloadHandlers.GetDeployStatus)
api.Get("/workloads/deploy-logs/:cluster/:namespace/:name", workloadHandlers.GetDeployLogs)
api.Get("/workloads/resolve-deps/:cluster/:namespace/:name", workloadHandlers.ResolveDependencies)
api.Get("/workloads/monitor/:cluster/:namespace/:name", workloadHandlers.MonitorWorkload)
api.Get("/workloads/:cluster/:namespace/:name", workloadHandlers.GetWorkload)
// NOTE: /workloads/deploy, /workloads/scale, and the DELETE
// /workloads/:cluster/:namespace/:name route all moved to kc-agent
// (#7993 Phase 1 PRs A and B). The agent uses the user's kubeconfig
// instead of the backend pod SA for those mutating operations.

// Cluster Group routes
api.Get("/cluster-groups", workloadHandlers.ListClusterGroups)
api.Post("/cluster-groups", workloadHandlers.CreateClusterGroup)
api.Post("/cluster-groups/sync", workloadHandlers.SyncClusterGroups)
api.Post("/cluster-groups/evaluate", workloadHandlers.EvaluateClusterQuery)
api.Post("/cluster-groups/ai-query", workloadHandlers.GenerateClusterQuery)
api.Put("/cluster-groups/:name", workloadHandlers.UpdateClusterGroup)
api.Delete("/cluster-groups/:name", workloadHandlers.DeleteClusterGroup)
}
