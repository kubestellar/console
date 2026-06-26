package api

import "time"

const (
	kcAgentProxyTimeout       = 30 * time.Second
	maxAgentProxyResponseSize = 10 * 1024 * 1024
)

// setupAPICoreRoutes registers the main authenticated API surface through a
// focused route group.
func (s *Server) setupAPICoreRoutes(routes *routeSetupContext) {
	newAPICoreRouteGroup(s.app, s.store, s.config, s.hub, s.notificationService, s.persistenceStore, s.k8sClient, s.lifecycle.done).Register(routes)
}
