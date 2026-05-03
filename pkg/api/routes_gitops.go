package api

import (
"github.com/gofiber/fiber/v2"

"github.com/kubestellar/console/pkg/api/handlers"
)

// setupGitOpsRoutes registers GitOps, ArgoCD, and self-upgrade routes.
// Includes the /mcp/operator-subscriptions compatibility alias.
func (s *Server) setupGitOpsRoutes(api fiber.Router) {
// GitOps routes (drift detection and sync)
// SECURITY: All GitOps routes require authentication in both dev and production modes
gitopsHandlers := handlers.NewGitOpsHandlers(s.bridge, s.k8sClient, s.store)
api.Get("/gitops/drifts", gitopsHandlers.ListDrifts)
api.Get("/gitops/helm-releases", gitopsHandlers.ListHelmReleases)
api.Get("/gitops/helm-history", gitopsHandlers.ListHelmHistory)
api.Get("/gitops/helm-values", gitopsHandlers.GetHelmValues)
api.Get("/gitops/kustomizations", gitopsHandlers.ListKustomizations)
api.Get("/gitops/operators", gitopsHandlers.ListOperators)
api.Get("/gitops/operators/stream", gitopsHandlers.StreamOperators)
api.Get("/gitops/operator-subscriptions", gitopsHandlers.ListOperatorSubscriptions)
api.Get("/gitops/operator-subscriptions/stream", gitopsHandlers.StreamOperatorSubscriptions)
api.Get("/gitops/helm-releases/stream", gitopsHandlers.StreamHelmReleases)
// POST /gitops/detect-drift, /gitops/sync, /gitops/helm-rollback,
// /gitops/helm-uninstall, and /gitops/helm-upgrade moved to kc-agent in
// #7993 Phase 4 (agent-side added in 3a/3b). They run under the user's
// kubeconfig instead of the backend pod ServiceAccount.

// Helm self-upgrade (in-cluster Deployment patch)
selfUpgradeHandler := handlers.NewSelfUpgradeHandler(s.k8sClient, s.hub, s.store)
api.Get("/self-upgrade/status", selfUpgradeHandler.GetStatus)
api.Post("/self-upgrade/trigger", selfUpgradeHandler.TriggerUpgrade)

// ArgoCD routes (Application CRD discovery and sync)
api.Get("/gitops/argocd/applications", gitopsHandlers.ListArgoApplications)
api.Get("/gitops/argocd/applicationsets", gitopsHandlers.ListArgoApplicationSets)
api.Get("/gitops/argocd/health", gitopsHandlers.GetArgoHealthSummary)
api.Get("/gitops/argocd/sync", gitopsHandlers.GetArgoSyncSummary)
api.Get("/gitops/argocd/status", gitopsHandlers.GetArgoStatus)
// POST /gitops/argocd/sync moved to kc-agent in #7993 Phase 4 (agent-side
// added in Phase 3c). Runs under the user's kubeconfig.

// Frontend compatibility alias
api.Get("/mcp/operator-subscriptions", gitopsHandlers.ListOperatorSubscriptions)
}
