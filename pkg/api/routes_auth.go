package api

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"

	"github.com/kubestellar/console/pkg/api/handlers"
	"github.com/kubestellar/console/pkg/api/handlers/feedback"
	"github.com/kubestellar/console/pkg/api/middleware"
)

type routeSetupContext struct {
	jwtAuth            fiber.Handler
	csrfGuard          fiber.Handler
	publicLimiter      fiber.Handler
	analyticsBodyGuard fiber.Handler
	publicAPI          fiber.Router
	api                fiber.Router
	bodyGuard          fiber.Handler
	feedback           *feedback.FeedbackHandler
	namespaces         *handlers.NamespaceHandler
	aiLimiter          fiber.Handler // per-user rate limit for AI-calling endpoints (#17294)
}

// oauthConfigured reports whether the server has a usable GitHub OAuth configuration.
func (s *Server) oauthConfigured() bool {
	s.auth.oauthMu.RLock()
	defer s.auth.oauthMu.RUnlock()
	return s.config.GitHubClientID != "" && s.config.GitHubSecret != ""
}

// resolveOAuthCredentials checks the SQLite store for persisted OAuth credentials.
func (s *Server) resolveOAuthCredentials() {
	if s.config.GitHubClientID != "" && s.config.GitHubSecret != "" {
		return
	}
	if os.Getenv("IGNORE_PERSISTED_OAUTH_CREDENTIALS") == "true" {
		slog.Info("[Server] skipping persisted OAuth credentials; using explicit environment only")
		return
	}
	dbID, dbSecret, err := s.store.GetOAuthCredentials(context.Background())
	if err != nil || dbID == "" {
		return
	}
	s.config.GitHubClientID = dbID
	s.config.GitHubSecret = dbSecret
	slog.Info("[Server] loaded OAuth credentials from database (manifest flow)")
}

// reloadOAuth hot-swaps the auth handler with new OAuth credentials after manifest flow completion.
func (s *Server) reloadOAuth(clientID, clientSecret string) {
	s.auth.oauthMu.Lock()
	defer s.auth.oauthMu.Unlock()

	s.config.GitHubClientID = clientID
	s.config.GitHubSecret = clientSecret

	if s.auth.handler != nil {
		s.auth.handler.Stop()
	}

	s.auth.handler = handlers.NewAuthHandler(s.store, handlers.AuthConfig{
		GitHubClientID: clientID,
		GitHubSecret:   clientSecret,
		GitHubURL:      s.config.GitHubURL,
		JWTSecret:      s.config.JWTSecret,
		FrontendURL:    s.config.FrontendURL,
		BackendURL:     s.backendURL(),
		DevUserLogin:   s.config.DevUserLogin,
		DevUserEmail:   s.config.DevUserEmail,
		DevUserAvatar:  s.config.DevUserAvatar,
		GitHubToken:    s.config.GitHubToken,
		DevMode:        s.config.DevMode,
		SkipOnboarding: s.config.SkipOnboarding,
	})
	s.auth.handler.SetHub(s.hub)
	s.auth.handler.SetSSECanceller(handlers.CancelUserSSEStreams)
	slog.Info("[Server] OAuth config hot-reloaded after manifest flow")
}

// setupAuthRoutes registers auth, OAuth manifest, and shared rate-limiter setup.
func (s *Server) setupAuthRoutes(app *fiber.App) *routeSetupContext {
	auth := handlers.NewAuthHandler(s.store, handlers.AuthConfig{
		GitHubClientID: s.config.GitHubClientID,
		GitHubSecret:   s.config.GitHubSecret,
		GitHubURL:      s.config.GitHubURL,
		JWTSecret:      s.config.JWTSecret,
		FrontendURL:    s.config.FrontendURL,
		BackendURL:     s.backendURL(),
		DevUserLogin:   s.config.DevUserLogin,
		DevUserEmail:   s.config.DevUserEmail,
		DevUserAvatar:  s.config.DevUserAvatar,
		GitHubToken:    s.config.GitHubToken,
		DevMode:        s.config.DevMode,
		SkipOnboarding: s.config.SkipOnboarding,
	})
	s.auth.handler = auth

	failureTracker := middleware.NewFailureTracker()
	s.auth.failureTracker = failureTracker

	authLimiterMaxRequests := 10
	authLimiterWindow := 1 * time.Minute
	authLimiter := limiter.New(limiter.Config{
		Max:          authLimiterMaxRequests,
		Expiration:   authLimiterWindow,
		KeyGenerator: middleware.CompositeKey,
		LimitReached: func(c *fiber.Ctx) error {
			ip := c.IP()
			retryAfter := failureTracker.GetRetryAfter(ip)
			count := failureTracker.GetFailureCount(ip)
			if count >= middleware.FailureThresholdSoftLock {
				slog.Warn("[RateLimit] auth soft-lock", "ip", ip, "failures", count)
			}
			c.Set("Retry-After", strconv.Itoa(retryAfter))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})
	injectTracker := func(c *fiber.Ctx) error {
		c.Locals("failureTracker", failureTracker)
		return c.Next()
	}

	auth.SetHub(s.hub)
	auth.SetSSECanceller(handlers.CancelUserSSEStreams)
	currentAuthHandler := func() *handlers.AuthHandler {
		s.auth.oauthMu.RLock()
		defer s.auth.oauthMu.RUnlock()
		return s.auth.handler
	}

	app.Get("/auth/github", authLimiter, injectTracker, func(c *fiber.Ctx) error {
		return currentAuthHandler().GitHubLogin(c)
	})
	app.Get("/auth/github/callback", authLimiter, injectTracker, func(c *fiber.Ctx) error {
		return currentAuthHandler().GitHubCallback(c)
	})

	manifest := handlers.NewManifestHandler(
		s.store,
		s.backendURL(),
		s.config.FrontendURL,
		s.config.GitHubURL,
		s.config.BootstrapToken,
		func(clientID, clientSecret string) { s.reloadOAuth(clientID, clientSecret) },
		s.oauthConfigured,
	)
	app.Get("/auth/manifest/setup", authLimiter, manifest.ManifestSetup)
	app.Get("/auth/manifest/callback", authLimiter, manifest.ManifestCallback)

	jwtAuth := middleware.JWTAuth(s.config.JWTSecret, s.config.AgentToken)
	csrfGuard := middleware.RequireCSRF()
	app.Post("/auth/refresh", authLimiter, injectTracker, csrfGuard, jwtAuth, func(c *fiber.Ctx) error {
		return currentAuthHandler().RefreshToken(c)
	})
	app.Post("/auth/logout", authLimiter, injectTracker, csrfGuard, jwtAuth, func(c *fiber.Ctx) error {
		return currentAuthHandler().Logout(c)
	})

	publicLimiterMaxRequests := 120
	publicLimiterWindow := 1 * time.Minute
	publicLimiter := limiter.New(limiter.Config{
		Max:        publicLimiterMaxRequests,
		Expiration: publicLimiterWindow,
		KeyGenerator: func(c *fiber.Ctx) string {
			return c.IP()
		},
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(publicLimiterWindow.Seconds())))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})

	const analyticsBodyLimit = 64 * 1024
	analyticsBodyGuard := func(c *fiber.Ctx) error {
		if len(c.Body()) > analyticsBodyLimit {
			return fiber.ErrRequestEntityTooLarge
		}
		return c.Next()
	}

	publicLimiterSkipPaths := map[string]bool{
		"/api/feedback/requests": true,
		"/api/me":                true,
		"/api/version":           true,
	}
	publicLimiterWithSkip := func(c *fiber.Ctx) error {
		path := c.Path()
		if publicLimiterSkipPaths[path] {
			return c.Next()
		}
		if strings.HasPrefix(path, "/api/github/") {
			return c.Next()
		}
		if strings.HasPrefix(path, "/api/auth/") {
			return c.Next()
		}
		return publicLimiter(c)
	}
	publicAPI := app.Group("/api", publicLimiterWithSkip)

	apiLimiterMaxRequests := 2000
	apiLimiterWindow := 1 * time.Minute
	apiLimiter := limiter.New(limiter.Config{
		Max:          apiLimiterMaxRequests,
		Expiration:   apiLimiterWindow,
		KeyGenerator: middleware.CompositeKey,
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(apiLimiterWindow.Seconds())))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})

	const feedbackLimiterMaxRequests = 10
	feedbackLimiterWindow := 1 * time.Hour
	feedbackLimiter := limiter.New(limiter.Config{
		Max:          feedbackLimiterMaxRequests,
		Expiration:   feedbackLimiterWindow,
		KeyGenerator: middleware.CompositeKey,
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(feedbackLimiterWindow.Seconds())))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "too many requests, try again later"})
		},
	})
	feedbackBodyGuard := func(c *fiber.Ctx) error {
		if len(c.Body()) > feedbackBodyLimit {
			return fiber.NewError(fiber.StatusRequestEntityTooLarge, "Feedback attachments exceed the 10 MB upload limit. Keep each video at or below 10 MB and retry with fewer or smaller attachments.")
		}
		return c.Next()
	}

	// aiLimiter enforces a strict per-user ceiling on AI-calling endpoints to
	// prevent denial-of-wallet attacks from compromised or rogue sessions (#17294).
	// 20 requests/minute is generous for interactive use but prevents bulk abuse.
	const aiLimiterMaxRequests = 20
	aiLimiterWindow := 1 * time.Minute
	aiLimiter := limiter.New(limiter.Config{
		Max:          aiLimiterMaxRequests,
		Expiration:   aiLimiterWindow,
		KeyGenerator: middleware.CompositeKey,
		LimitReached: func(c *fiber.Ctx) error {
			c.Set("Retry-After", strconv.Itoa(int(aiLimiterWindow.Seconds())))
			return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"error": "AI rate limit exceeded, try again later"})
		},
	})
	bodyGuard := func(c *fiber.Ctx) error {
		if c.Method() == fiber.MethodPost && c.Path() == "/api/feedback/requests" {
			return c.Next()
		}
		if len(c.Body()) > apiDefaultBodyLimit {
			return fiber.ErrRequestEntityTooLarge
		}
		return c.Next()
	}

	feedbackCfg := feedback.LoadFeedbackConfig()
	feedbackHandler := feedback.NewFeedbackHandler(s.store, feedbackCfg)
	app.Post("/api/feedback/requests", feedbackBodyGuard, csrfGuard, jwtAuth, feedbackLimiter, feedbackHandler.CreateFeatureRequest)

	apiLimiterSkipPaths := map[string]bool{
		"/api/feedback/requests": true,
		"/api/me":                true,
		"/api/version":           true,
		"/api/mcp/clusters":      true,
	}
	apiLimiterSkipPrefixes := []string{"/api/github/"}
	apiLimiterWithSkip := func(c *fiber.Ctx) error {
		path := c.Path()
		if apiLimiterSkipPaths[path] {
			return c.Next()
		}
		for _, prefix := range apiLimiterSkipPrefixes {
			if strings.HasPrefix(path, prefix) {
				return c.Next()
			}
		}
		return apiLimiter(c)
	}

	api := app.Group("/api", apiLimiterWithSkip, bodyGuard, csrfGuard, jwtAuth)

	return &routeSetupContext{
		jwtAuth:            jwtAuth,
		csrfGuard:          csrfGuard,
		publicLimiter:      publicLimiter,
		analyticsBodyGuard: analyticsBodyGuard,
		publicAPI:          publicAPI,
		api:                api,
		bodyGuard:          bodyGuard,
		feedback:           feedbackHandler,
		aiLimiter:          aiLimiter,
	}
}
