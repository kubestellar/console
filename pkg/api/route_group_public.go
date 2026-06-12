package api

import (
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	ghhandlers "github.com/kubestellar/console/pkg/api/handlers/github"
	"github.com/kubestellar/console/pkg/api/handlers/missions"
	"github.com/kubestellar/console/pkg/compliance/residency"
	"github.com/kubestellar/console/pkg/store"
)

type publicRouteGroup struct {
	app         *fiber.App
	store       store.Store
	hub         *handlers.Hub
	githubToken string
}

func newPublicRouteGroup(app *fiber.App, store store.Store, hub *handlers.Hub, githubToken string) *publicRouteGroup {
	return &publicRouteGroup{
		app:         app,
		store:       store,
		hub:         hub,
		githubToken: githubToken,
	}
}

func (g *publicRouteGroup) Register(publicLimiter, analyticsBodyGuard fiber.Handler, publicAPI fiber.Router) {
	g.app.Get("/api/active-users", publicLimiter, func(c *fiber.Ctx) error {
		wsUsers := g.hub.GetActiveUsersCount()
		demoSessions := g.hub.GetDemoSessionCount()
		wsTotalConns := g.hub.GetTotalConnectionsCount()

		activeUsers := wsUsers
		if demoSessions > wsUsers {
			activeUsers = demoSessions
		}
		totalConnections := wsTotalConns
		if demoSessions > wsTotalConns {
			totalConnections = demoSessions
		}

		return c.JSON(fiber.Map{
			"activeUsers":      activeUsers,
			"totalConnections": totalConnections,
		})
	})

	g.app.Post("/api/active-users", publicLimiter, func(c *fiber.Ctx) error {
		var body struct {
			SessionID string `json:"sessionId"`
		}
		if err := c.BodyParser(&body); err != nil || body.SessionID == "" {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "sessionId required"})
		}
		if !g.hub.RecordDemoSession(body.SessionID) {
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "session limit reached"})
		}
		demoCount := g.hub.GetDemoSessionCount()
		return c.JSON(fiber.Map{
			"activeUsers":      demoCount,
			"totalConnections": demoCount,
		})
	})

	nightlyE2EPublic := ghhandlers.NewNightlyE2EHandler(g.githubToken)
	g.app.Get("/api/public/nightly-e2e/runs", publicLimiter, nightlyE2EPublic.GetRuns)
	g.app.Get("/api/public/nightly-e2e/run-logs", publicLimiter, nightlyE2EPublic.GetRunLogs)

	g.app.All("/api/m", publicLimiter, analyticsBodyGuard, handlers.GA4CollectProxy)
	g.app.Get("/api/gtag", publicLimiter, handlers.GA4ScriptProxy)
	g.app.Get("/api/ksc", publicLimiter, handlers.UmamiScriptProxy)
	g.app.Post("/api/send", publicLimiter, analyticsBodyGuard, handlers.UmamiCollectProxy)

	// /api/ping moved to authenticated group (CWE-918 / #16948)
	g.app.Get("/api/youtube/playlist", publicLimiter, handlers.YouTubePlaylistHandler)
	g.app.Get("/api/youtube/thumbnail/:id", publicLimiter, handlers.YouTubeThumbnailProxy)
	g.app.Get("/api/medium/blog", publicLimiter, handlers.MediumBlogHandler)

	missionsHandler := missions.NewMissionsHandler().WithStore(g.store)
	missionsHandler.RegisterPublicRoutes(g.app.Group("/api/missions"))

	complianceFrameworks := handlers.NewComplianceFrameworksHandler(nil)
	complianceFrameworks.RegisterPublicRoutes(g.app.Group("/api/compliance/frameworks", publicLimiter))

	residencyEngine := residency.NewEngine()
	dataResidency := handlers.NewDataResidencyHandler(residencyEngine)
	dataResidency.RegisterPublicRoutes(g.app.Group("/api/compliance/residency", publicLimiter))

	changeControl := handlers.NewChangeControlHandler()
	changeControl.RegisterPublicRoutes(publicAPI)

	sodHandler := handlers.NewSoDHandler()
	sodHandler.RegisterPublicRoutes(publicAPI)

	baaHandler := handlers.NewBAAHandler()
	baaHandler.RegisterPublicRoutes(publicAPI)

	hipaaHandler := handlers.NewHIPAAHandler()
	hipaaHandler.RegisterPublicRoutes(publicAPI)

	gxpHandler := handlers.NewGxPHandler()
	gxpHandler.RegisterPublicRoutes(publicAPI)

	nistHandler := handlers.NewNIST80053Handler()
	nistHandler.RegisterPublicRoutes(publicAPI)

	stigHandler := handlers.NewSTIGHandler()
	stigHandler.RegisterPublicRoutes(publicAPI)

	airgapHandler := handlers.NewAirGapHandler()
	airgapHandler.RegisterPublicRoutes(publicAPI)

	fedrampHandler := handlers.NewFedRAMPHandler()
	fedrampHandler.RegisterPublicRoutes(publicAPI)

	sbomHandler := handlers.NewSBOMHandler()
	sbomHandler.RegisterPublicRoutes(publicAPI)
	signingHandler := handlers.NewSigningHandler()
	signingHandler.RegisterPublicRoutes(publicAPI)
	slsaHandler := handlers.NewSLSAHandler()
	slsaHandler.RegisterPublicRoutes(publicAPI)
	licenseHandler := handlers.NewLicenseHandler()
	licenseHandler.RegisterPublicRoutes(publicAPI)
	attestationHandler := handlers.NewAttestationHandler()
	attestationHandler.RegisterPublicRoutes(publicAPI)
}
