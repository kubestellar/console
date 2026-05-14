package api

import (
	"log/slog"
	"os"
	"strings"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/middleware"
)

// setupWebSocketStaticRoutes registers webhook, websocket, and static/frontend routes.
func (s *Server) setupWebSocketStaticRoutes(routes *routeSetupContext) {
	feedback := routes.feedback
	if feedback == nil {
		feedback = handlers.NewFeedbackHandler(s.store, handlers.LoadFeedbackConfig())
		routes.feedback = feedback
	}
	s.app.Post("/webhooks/github", feedback.HandleGitHubWebhook)

	s.app.Use("/ws", routes.publicLimiter, middleware.WebSocketUpgrade())
	s.app.Get("/ws", websocket.New(func(c *websocket.Conn) {
		s.hub.HandleConnection(c)
	}))

	if !s.config.DevMode || fileExists("./web/dist/index.html") {
		s.app.Use(preCompressedStatic("./web/dist"))
		s.app.Get("/*", func(c *fiber.Ctx) error {
			c.Set("Cache-Control", "public, max-age=0, must-revalidate")
			return c.SendFile("./web/dist/index.html")
		})
		return
	}

	if _, err := os.Stat("./web/dist/index.html"); err == nil {
		slog.Info("[Server] dev mode active but web/dist found — serving static files instead of redirecting to Vite")
		s.app.Use(preCompressedStatic("./web/dist"))
		s.app.Get("/*", func(c *fiber.Ctx) error {
			c.Set("Cache-Control", "public, max-age=0, must-revalidate")
			return c.SendFile("./web/dist/index.html")
		})
		return
	}

	devFrontend := strings.TrimRight(s.config.FrontendURL, "/")
	s.app.Get("/*", func(c *fiber.Ctx) error {
		target := devFrontend + c.OriginalURL()
		return c.Redirect(target, fiber.StatusTemporaryRedirect)
	})
}
