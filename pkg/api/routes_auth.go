package api

import (
	"context"
	"log/slog"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/limiter"

	"github.com/kubestellar/console/pkg/api/handlers"
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
	feedback           *handlers.FeedbackHandler
	namespaces         *handlers.NamespaceHandler
}

// oauthConfigured reports whether the server has a usable GitHub OAuth configuration.
func (s *Server) oauthConfigured() bool {
	s.oauthMu.RLock()
	defer s.oauthMu.RUnlock()
	return s.config.GitHubClientID != "" && s.config.GitHubSecret != ""
}

// resolveOAuthCredentials checks the SQLite store for persisted OAuth credentials.
func (s *Server) resolveOAuthCredentials() {
	if s.config.GitHubClientID != "" && s.config.GitHubSecret != "" {
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
	s.oauthMu.Lock()
	defer s.oauthMu.Unlock()

	s.config.GitHubClientID = clientID
	s.config.GitHubSecret = clientSecret

	if s.authHandler != nil {
		s.authHandler.Stop()
	}

	s.authHandler = handlers.NewAuthHandler(s.store, handlers.AuthConfig{
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
	s.authHandler.SetHub(s.hub)
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
	s.authHandler = auth

	failureTracker := middleware.NewFailureTracker()
	s.failureTracker = failureTracker

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
	currentAuthHandler := func() *handlers.AuthHandler {
		s.oauthMu.RLock()
		defer s.oauthMu.RUnlock()
		return s.authHandler
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
		func(clientID, clientSecret string) { s.reloadOAuth(clientID, clientSecret) },
		s.oauthConfigured,
	)
	app.Get("/auth/manifest/setup", authLimiter, manifest.ManifestSetup)
	app.Get("/auth/manifest/callback", authLimiter, manifest.ManifestCallback)

	jwtAuth := middleware.JWTAuth(s.config.JWTSecret)
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
	bodyGuard := func(c *fiber.Ctx) error {
		if c.Method() == fiber.MethodPost && c.Path() == "/api/feedback/requests" {
			return c.Next()
		}
		if len(c.Body()) > apiDefaultBodyLimit {
			return fiber.ErrRequestEntityTooLarge
		}
		return c.Next()
	}

	feedbackCfg := handlers.LoadFeedbackConfig()
	feedback := handlers.NewFeedbackHandler(s.store, feedbackCfg)
	app.Post("/api/feedback/requests", feedbackBodyGuard, csrfGuard, jwtAuth, feedbackLimiter, feedback.CreateFeatureRequest)

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
		feedback:           feedback,
	}
}
