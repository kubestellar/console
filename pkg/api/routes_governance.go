package api

// setupGovernanceRoutes registers RBAC, compliance, namespace, and admin routes
// through a focused route group.
func (s *Server) setupGovernanceRoutes(routes *routeSetupContext) {
	newGovernanceRouteGroup(s.store, s.k8sClient, s.auth.failureTracker).Register(routes)
}
