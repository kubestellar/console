package api

import (
	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/compliance"
	"github.com/kubestellar/console/pkg/k8s"
	"github.com/kubestellar/console/pkg/store"
)

type governanceRouteGroup struct {
	store     store.Store
	k8sClient *k8s.MultiClusterClient
}

func newGovernanceRouteGroup(store store.Store, k8sClient *k8s.MultiClusterClient) *governanceRouteGroup {
	return &governanceRouteGroup{
		store:     store,
		k8sClient: k8sClient,
	}
}

func (g *governanceRouteGroup) Register(routes *routeSetupContext) {
	api := routes.api

	// Teams, RBAC and rate-limit status now register through
	// admin.NewRegistrar() from the api-core route group.
	auditHandler := compliance.NewAuditHandler(g.store)
	api.Get("/admin/audit-log", auditHandler.GetAuditLog)

	complianceFrameworks := compliance.NewComplianceFrameworksHandler(nil)
	complianceFrameworks.RegisterRoutes(api.Group("/compliance/frameworks"))
	complianceReports := compliance.NewComplianceReportsHandler(nil)
	complianceReports.RegisterRoutes(api.Group("/compliance/frameworks"))

	routes.namespaces = handlers.NewNamespaceHandler(g.store, g.k8sClient)
	api.Get("/namespaces", routes.namespaces.ListNamespaces)
	api.Get("/namespaces/:name/access", routes.namespaces.GetNamespaceAccess)

	// SIEM export (admin-only, moved from public routes — fix #16518).
	siemHandler := compliance.NewSIEMHandler(g.store)
	siemHandler.RegisterRoutes(api)
}
