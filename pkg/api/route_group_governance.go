package api

import (
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/compliance"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

type governanceRouteGroup struct {
	store          store.Store
	k8sClient      *k8s.MultiClusterClient
	failureTracker *middleware.FailureTracker
}

func newGovernanceRouteGroup(store store.Store, k8sClient *k8s.MultiClusterClient, failureTracker *middleware.FailureTracker) *governanceRouteGroup {
	return &governanceRouteGroup{
		store:          store,
		k8sClient:      k8sClient,
		failureTracker: failureTracker,
	}
}

func (g *governanceRouteGroup) Register(routes *routeSetupContext) {
	api := routes.api

	rbac := handlers.NewRBACHandler(g.store, g.k8sClient)
	api.Get("/users", rbac.ListConsoleUsers)
	api.Put("/users/:id/role", rbac.UpdateUserRole)
	api.Delete("/users/:id", rbac.DeleteConsoleUser)
	api.Get("/users/summary", rbac.GetUserManagementSummary)
	api.Get("/rbac/users", rbac.ListK8sUsers)
	api.Get("/openshift/users", rbac.ListOpenShiftUsers)
	api.Get("/rbac/service-accounts", rbac.ListK8sServiceAccounts)
	api.Get("/rbac/roles", rbac.ListK8sRoles)
	api.Get("/rbac/bindings", rbac.ListK8sRoleBindings)

	auditHandler := handlers.NewAuditHandler(g.store)
	api.Get("/admin/audit-log", auditHandler.GetAuditLog)

	complianceFrameworks := compliance.NewComplianceFrameworksHandler(nil)
	complianceFrameworks.RegisterRoutes(api.Group("/compliance/frameworks"))
	complianceReports := compliance.NewComplianceReportsHandler(nil)
	complianceReports.RegisterRoutes(api.Group("/compliance/frameworks"))

	routes.namespaces = handlers.NewNamespaceHandler(g.store, g.k8sClient)
	api.Get("/namespaces", routes.namespaces.ListNamespaces)
	api.Get("/namespaces/:name/access", routes.namespaces.GetNamespaceAccess)

	adminHandler := handlers.NewAdminHandler(g.failureTracker, g.store)
	api.Get("/admin/rate-limit-status", adminHandler.GetRateLimitStatus)

	// SIEM export (admin-only, moved from public routes — fix #16518).
	siemHandler := compliance.NewSIEMHandler(g.store)
	siemHandler.RegisterRoutes(api)
}
