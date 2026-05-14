package api

import "github.com/kubestellar/console/pkg/api/handlers"

// setupGovernanceRoutes registers RBAC, compliance, namespace, and admin routes.
func (s *Server) setupGovernanceRoutes(routes *routeSetupContext) {
	api := routes.api

	rbac := handlers.NewRBACHandler(s.store, s.k8sClient)
	api.Get("/users", rbac.ListConsoleUsers)
	api.Put("/users/:id/role", rbac.UpdateUserRole)
	api.Delete("/users/:id", rbac.DeleteConsoleUser)
	api.Get("/users/summary", rbac.GetUserManagementSummary)
	api.Get("/rbac/users", rbac.ListK8sUsers)
	api.Get("/openshift/users", rbac.ListOpenShiftUsers)
	api.Get("/rbac/service-accounts", rbac.ListK8sServiceAccounts)
	api.Get("/rbac/roles", rbac.ListK8sRoles)
	api.Get("/rbac/bindings", rbac.ListK8sRoleBindings)

	auditHandler := handlers.NewAuditHandler(s.store)
	api.Get("/admin/audit-log", auditHandler.GetAuditLog)

	complianceFrameworks := handlers.NewComplianceFrameworksHandler(nil)
	complianceFrameworks.RegisterRoutes(api.Group("/compliance/frameworks"))
	complianceReports := handlers.NewComplianceReportsHandler(nil)
	complianceReports.RegisterRoutes(api.Group("/compliance/frameworks"))

	routes.namespaces = handlers.NewNamespaceHandler(s.store, s.k8sClient)
	api.Get("/namespaces", routes.namespaces.ListNamespaces)
	api.Get("/namespaces/:name/access", routes.namespaces.GetNamespaceAccess)

	adminHandler := handlers.NewAdminHandler(s.failureTracker)
	api.Get("/admin/rate-limit-status", adminHandler.GetRateLimitStatus)
}
