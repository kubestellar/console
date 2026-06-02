package api

import "github.com/gofiber/fiber/v2"

// setupPublicRoutes registers unauthenticated API routes through a focused
// route group so the server only supplies the dependencies it owns.
func (s *Server) setupPublicRoutes(publicLimiter, analyticsBodyGuard fiber.Handler, publicAPI fiber.Router) {
	newPublicRouteGroup(s.app, s.store, s.hub, s.config.GitHubToken).Register(publicLimiter, analyticsBodyGuard, publicAPI)
}
