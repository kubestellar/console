package agent

import "net/http"

func (s *Server) registerRoutes(mux *http.ServeMux) {
	// Health endpoint (HTTP for easy browser detection)
	mux.HandleFunc("/health", s.handleHealth)

	// Status endpoint — authenticated version of /health. Used by the frontend
	// (useLocalAgent.ts) to verify that the browser has a valid agent token
	// before marking the connection as "connected".
	mux.HandleFunc("/status", s.handleStatus)

	// Clusters endpoint - returns fresh kubeconfig contexts
	mux.HandleFunc("/clusters", s.handleClustersHTTP)

	// Cluster data endpoints - direct k8s queries without backend
	mux.HandleFunc("/gpu-nodes", s.handleGPUNodesHTTP)
	mux.HandleFunc("/gpu-nodes/stream", s.handleGPUNodesStreamSSE)
	mux.HandleFunc("/nodes", s.handleNodesHTTP)
	mux.HandleFunc("/nodes/stream", s.handleNodesStreamSSE)
	mux.HandleFunc("/pods", s.handlePodsHTTP)
	mux.HandleFunc("/pods/stream", s.handlePodsStreamSSE)
	mux.HandleFunc("/events", s.handleEventsHTTP)
	mux.HandleFunc("/events/stream", s.handleEventsStreamSSE)
	mux.HandleFunc("/namespaces", s.handleNamespacesHTTP)
	mux.HandleFunc("/deployments", s.handleDeploymentsHTTP)
	mux.HandleFunc("/replicasets", s.handleReplicaSetsHTTP)
	mux.HandleFunc("/statefulsets", s.handleStatefulSetsHTTP)
	mux.HandleFunc("/daemonsets", s.handleDaemonSetsHTTP)
	mux.HandleFunc("/cronjobs", s.handleCronJobsHTTP)
	mux.HandleFunc("/ingresses", s.handleIngressesHTTP)
	mux.HandleFunc("/networkpolicies", s.handleNetworkPoliciesHTTP)
	mux.HandleFunc("/services", s.handleServicesHTTP)
	mux.HandleFunc("/configmaps", s.handleConfigMapsHTTP)
	mux.HandleFunc("/secrets", s.handleSecretsHTTP)
	mux.HandleFunc("/serviceaccounts", s.handleServiceAccountsHTTP)
	mux.HandleFunc("/jobs", s.handleJobsHTTP)
	mux.HandleFunc("/jobs/stream", s.handleJobsStreamSSE)
	mux.HandleFunc("/hpas", s.handleHPAsHTTP)
	mux.HandleFunc("/pvcs", s.handlePVCsHTTP)
	mux.HandleFunc("/pvs", s.handlePVsHTTP)
	mux.HandleFunc("/cluster-health", s.handleClusterHealthHTTP)
	mux.HandleFunc("/roles", s.handleRolesHTTP)
	mux.HandleFunc("/rolebindings", s.handleRoleBindingsHTTP)
	mux.HandleFunc("/resourcequotas", s.handleResourceQuotasHTTP)
	mux.HandleFunc("/limitranges", s.handleLimitRangesHTTP)
	mux.HandleFunc("/resolve-deps", s.handleResolveDepsHTTP)
	mux.HandleFunc("/scale", s.handleScaleHTTP)
	// Workload deploy and delete routes moved to kc-agent (#7993 Phase 1 PR B).
	// These run under the user's kubeconfig instead of the backend pod SA.
	mux.HandleFunc("/workloads/deploy", s.handleDeployWorkloadHTTP)
	mux.HandleFunc("/workloads/delete", s.handleDeleteWorkloadHTTP)

	// MCS ServiceExport create/delete moved to kc-agent (#7993 Phase 1.5 PR B).
	// The backend had Create/DeleteServiceExport handlers with no frontend
	// consumer; they've been removed. This route keeps the capability
	// available for future MCS-export UI work.
	mux.HandleFunc("/serviceexports", s.handleServiceExportsHTTP)

	// Cilium status — aggregated eBPF networking health across all clusters (#9400)
	mux.HandleFunc("/cilium-status", s.handleCiliumStatus)

	// Jaeger status — distributed tracing health and metrics (#10243)
	mux.HandleFunc("/jaeger-status", s.handleJaegerStatus)

	// Helm mutating operations moved to kc-agent (#7993 Phase 3a). These shell
	// `helm rollback` / `helm uninstall` / `helm upgrade` under the user's
	// kubeconfig instead of the backend pod SA. Backend handlers are still
	// present until Phase 4 deletes them — routes in pkg/agent/server_helm.go.
	mux.HandleFunc("/helm/rollback", s.handleHelmRollback)
	mux.HandleFunc("/helm/uninstall", s.handleHelmUninstall)
	mux.HandleFunc("/helm/upgrade", s.handleHelmUpgrade)

	// ConsoleResource CR writes moved to kc-agent (#7993 Phase 2.5).
	// ManagedWorkload / ClusterGroup / WorkloadDeployment creates, updates,
	// and deletes now run under the user's kubeconfig. The backend still
	// hosts the reconciler (console_persistence.go StartWatcher /
	// reconcileDeployment) because that's system-internal — it reacts to
	// CR state changes without a human in the loop and legitimately runs
	// as the pod SA.
	mux.HandleFunc("/console-cr/workloads", s.handleConsoleCRManagedWorkloads)
	mux.HandleFunc("/console-cr/groups", s.handleConsoleCRClusterGroups)
	mux.HandleFunc("/console-cr/deployments", s.handleConsoleCRWorkloadDeployments)
	mux.HandleFunc("/console-cr/deployments/status", s.handleConsoleCRWorkloadDeploymentStatus)

	// Federation / multi-cluster-management awareness (Issue 9368, PR A).
	// Read-only endpoints that fan out across every kubeconfig context in
	// parallel and query every registered federation provider (OCM,
	// Karmada, Clusternet, Liqo, KubeAdmiral, CAPI). PR A ships with the
	// registry empty — providers register themselves in later PRs.
	// Identity rule: all reads run under the user's kubeconfig; no
	// pod-ServiceAccount fallback. See pkg/agent/server_federation.go and
	// the master plan referenced at the top of that file.
	mux.HandleFunc("/federation/detect", s.handleFederationDetect)
	mux.HandleFunc("/federation/clusters", s.handleFederationClusters)
	mux.HandleFunc("/federation/groups", s.handleFederationGroups)
	mux.HandleFunc("/federation/pending-joins", s.handleFederationPendingJoins)
	// Phase 2: imperative action endpoint. Providers that implement
	// ActionProvider expose management operations (approve CSR, accept/detach
	// cluster, add taints) via POST. Same bearer-token identity contract as
	// the read handlers above.
	mux.HandleFunc("/federation/action", s.handleFederationAction)

	// GitOps drift detection + kubectl sync moved to kc-agent (#7993 Phase 3b).
	// These shell `kubectl diff` / `kubectl apply` under the user's kubeconfig.
	// Backend handlers are still present until Phase 4 deletes them — routes
	// in pkg/agent/server_gitops.go.
	mux.HandleFunc("/gitops/detect-drift", s.handleDetectDrift)
	mux.HandleFunc("/gitops/sync", s.handleGitopsSync)

	// ArgoCD application sync moved to kc-agent (#7993 Phase 3c). The
	// annotation-patch fallback strategy now runs under the user's kubeconfig
	// instead of the backend pod ServiceAccount. The REST-API and CLI
	// strategies are environment-side and behave identically. Backend handler
	// is still present until Phase 4 deletes it — route in
	// pkg/agent/server_argocd.go.
	mux.HandleFunc("/argocd/sync", s.handleArgoCDSync)

	// GPU health CronJob install/uninstall moved to kc-agent (#7993 Phase 3e).
	// The shared pkg/k8s.MultiClusterClient methods create the CronJob plus
	// the RBAC bundle — kc-agent runs under the user's kubeconfig. Backend
	// handlers are deleted in this same PR along with the frontend migration.
	// Route in pkg/agent/server_gpu_health.go.
	mux.HandleFunc("/gpu-health-cronjob", s.handleGPUHealthCronJob)

	// NVIDIA operator detection (#10389). Scans clusters for GPU Operator,
	// device plugin, feature discovery, and Network Operator installations.
	// Route in pkg/agent/server_nvidia.go.
	mux.HandleFunc("/nvidia-operators", s.handleNvidiaOperatorsHTTP)

	// RBAC / permissions introspection moved to kc-agent (#7993 Phase 6).
	// SelfSubjectAccessReview must be issued under the caller's identity, not
	// the backend pod ServiceAccount — otherwise in-cluster the answer
	// reflects the pod SA's permissions instead of the user's. Routes in
	// pkg/agent/server_rbac.go. Backend handlers are deleted in the same PR.
	mux.HandleFunc("/rbac/can-i", s.handleCanIHTTP)
	mux.HandleFunc("/rbac/permissions", s.handleClusterPermissionsHTTP)
	mux.HandleFunc("/permissions/summary", s.handlePermissionsSummaryHTTP)

	// Rename context endpoint
	mux.HandleFunc("/rename-context", s.handleRenameContextHTTP)

	// Kubeconfig import endpoints
	mux.HandleFunc("/kubeconfig/preview", s.handleKubeconfigPreviewHTTP)
	mux.HandleFunc("/kubeconfig/import", s.handleKubeconfigImportHTTP)
	mux.HandleFunc("/kubeconfig/add", s.handleKubeconfigAddHTTP)
	mux.HandleFunc("/kubeconfig/test", s.handleKubeconfigTestHTTP)
	mux.HandleFunc("/kubeconfig/remove", s.handleKubeconfigRemoveHTTP)

	// Settings endpoints for API key management
	mux.HandleFunc("/settings/keys", s.handleSettingsKeys)
	mux.HandleFunc("/settings/keys/", s.handleSettingsKeyByProvider)

	// Persistent settings endpoints (saves to ~/.kc/settings.json on the user's machine)
	mux.HandleFunc("/settings", s.handleSettingsAll)
	mux.HandleFunc("/settings/export", s.handleSettingsExport)
	mux.HandleFunc("/settings/import", s.handleSettingsImport)

	// Provider health check (proxies status page checks server-side to avoid CORS)
	mux.HandleFunc("/providers/health", s.handleProvidersHealth)

	// Provider readiness check - runs handshake for a specific provider
	mux.HandleFunc("/provider/check", s.handleProviderCheck)

	// Prediction endpoints
	mux.HandleFunc("/predictions/ai", s.handlePredictionsAI)
	mux.HandleFunc("/predictions/analyze", s.handlePredictionsAnalyze)
	mux.HandleFunc("/predictions/feedback", s.handlePredictionsFeedback)
	mux.HandleFunc("/predictions/stats", s.handlePredictionsStats)

	// Insight enrichment endpoints
	mux.HandleFunc("/insights/enrich", s.handleInsightsEnrich)
	mux.HandleFunc("/insights/ai", s.handleInsightsAI)

	// Device tracking endpoints
	mux.HandleFunc("/devices/alerts", s.handleDeviceAlerts)
	mux.HandleFunc("/devices/alerts/clear", s.handleDeviceAlertsClear)
	mux.HandleFunc("/devices/inventory", s.handleDeviceInventory)
	mux.HandleFunc("/metrics/history", s.handleMetricsHistory)

	// Kagenti AI agent platform endpoints
	mux.HandleFunc("/kagenti/agents", s.handleKagentiAgents)
	mux.HandleFunc("/kagenti/builds", s.handleKagentiBuilds)
	mux.HandleFunc("/kagenti/cards", s.handleKagentiCards)
	mux.HandleFunc("/kagenti/tools", s.handleKagentiTools)
	mux.HandleFunc("/kagenti/summary", s.handleKagentiSummary)

	// Kagent CRD endpoints (kagent.dev API group)
	mux.HandleFunc("/kagent-crds/agents", s.handleKagentCRDAgents)
	mux.HandleFunc("/kagent-crds/tools", s.handleKagentCRDTools)
	mux.HandleFunc("/kagent-crds/models", s.handleKagentCRDModels)
	mux.HandleFunc("/kagent-crds/memories", s.handleKagentCRDMemories)
	mux.HandleFunc("/kagent-crds/summary", s.handleKagentCRDSummary)

	// Cloud CLI status (detects installed cloud CLIs for IAM auth guidance)
	mux.HandleFunc("/cloud-cli-status", s.handleCloudCLIStatus)

	// Local cluster management endpoints
	mux.HandleFunc("/local-cluster-tools", s.handleLocalClusterTools)
	mux.HandleFunc("/local-clusters", s.handleLocalClusters)
	mux.HandleFunc("/local-cluster-lifecycle", s.handleLocalClusterLifecycle)

	// vCluster management endpoints
	mux.HandleFunc("/vcluster/list", s.handleVClusterList)
	mux.HandleFunc("/vcluster/create", s.handleVClusterCreate)
	mux.HandleFunc("/vcluster/connect", s.handleVClusterConnect)
	mux.HandleFunc("/vcluster/disconnect", s.handleVClusterDisconnect)
	mux.HandleFunc("/vcluster/delete", s.handleVClusterDelete)
	mux.HandleFunc("/vcluster/check", s.handleVClusterCheck)

	// Chat cancel endpoint — HTTP fallback when WebSocket is disconnected
	mux.HandleFunc("/cancel-chat", s.handleCancelChatHTTP)

	// Backend process management
	mux.HandleFunc("/restart-backend", s.handleRestartBackend)

	// Auto-update endpoints
	mux.HandleFunc("/auto-update/config", s.handleAutoUpdateConfig)
	mux.HandleFunc("/auto-update/status", s.handleAutoUpdateStatus)
	mux.HandleFunc("/auto-update/trigger", s.handleAutoUpdateTrigger)
	mux.HandleFunc("/auto-update/cancel", s.handleAutoUpdateCancel)

	// Prometheus query proxy - queries Prometheus in user clusters via K8s API server proxy
	mux.HandleFunc("/prometheus/query", s.handlePrometheusQuery)

	// Prometheus metrics endpoint (agent's own metrics)
	mux.Handle("/metrics", GetMetricsHandler())

	// WebSocket endpoint
	mux.HandleFunc("/ws", s.handleWebSocket)
	// Pod exec WebSocket moved to kc-agent (#7993 Phase 3d-A). Runs the
	// SPDY exec stream under the user's kubeconfig so the target cluster's
	// apiserver enforces RBAC natively — no SubjectAccessReview dance is
	// needed, unlike pkg/api/handlers/exec.go which uses the pod SA and
	// has to simulate the user identity. Handler in server_exec.go.
	mux.HandleFunc("/ws/exec", s.handleExec)

	// CORS preflight - uses isAllowedOrigin() instead of wildcard to restrict access.
	// #9155: The catchall preflight must advertise the same superset of methods
	// supported by individual handlers (GET/POST/PUT/DELETE/PATCH), so that any
	// preflight that falls through to "/" (e.g. due to a path typo or future
	// route refactor) does not silently strip DELETE/PUT/PATCH from the
	// browser's allowed methods. Per-handler setCORSHeaders() calls still
	// narrow this to the exact methods each endpoint accepts.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		s.setCORSHeaders(w, r, catchallCORSAllowedMethods)
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		http.NotFound(w, r)
	})
}
