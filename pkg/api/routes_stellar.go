package api

import (
	"log/slog"

	"github.com/kubestellar/console/pkg/api/handlers"
)

// setupStellarRoutes registers all Stellar AI agent endpoints through a focused
// route group so the server only orchestrates wiring.
func (s *Server) setupStellarRoutes(routes *routeSetupContext) {
	stelStore, ok := s.store.(handlers.StellarStore)
	if !ok {
		("[Server] store does not implement StellarStore — stellar routes will not be registered")

	}

	newStellarRouteGroup(stelStore, s.k8sClient, s.lifecycle.done).Register(routes.api)
}
