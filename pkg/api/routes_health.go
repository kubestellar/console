package api

import (
	"strings"
	"sync/atomic"

	"github.com/gofiber/fiber/v2"
)

// isQuantumWorkloadRunning detects if quantum-kc-demo is running in any cluster.
func (s *Server) isQuantumWorkloadRunning() bool {
	if s.quantumCache == nil {
		return false
	}
	return s.quantumCache.isRunning(s.k8sClient)
}

// setupHealthRoutes registers the /healthz, /health, and /api/version
// endpoints. These are unauthenticated and used by load balancers,
// liveness probes, and the frontend boot sequence.
func (s *Server) setupHealthRoutes() {
	// Minimal probe endpoint for load balancers and k8s liveness checks.
	// Returns only status — no configuration metadata.
	s.app.Get("/healthz", func(c *fiber.Ctx) error {
		if s.lifecycle != nil && atomic.LoadInt32(&s.lifecycle.shuttingDown) == 1 {
			return c.JSON(fiber.Map{"status": "shutting_down"})
		}
		return c.JSON(fiber.Map{"status": "ok"})
	})

	// Health check — returns version and UI configuration for the frontend.
	// Build metadata (go_version, git_commit, etc.) lives in /api/version.
	s.app.Get("/health", func(c *fiber.Ctx) error {
		if s.lifecycle != nil && atomic.LoadInt32(&s.lifecycle.shuttingDown) == 1 {
			return c.JSON(fiber.Map{"status": "shutting_down", "version": Version})
		}
		inCluster := s.k8sClient != nil && s.k8sClient.IsInCluster()

		healthStatus := "ok"
		if s.k8sClient != nil {
			cachedHealth := s.k8sClient.GetCachedHealth()
			if len(cachedHealth) > 0 {
				anyReachable := false
				for _, h := range cachedHealth {
					if h != nil && h.Reachable {
						anyReachable = true
						break
					}
				}
				if !anyReachable {
					healthStatus = "degraded"
				}
			}
		}

		noLocalAgent := s.config.NoLocalAgent || inCluster

		resp := fiber.Map{
			"status":           healthStatus,
			"version":          Version,
			"oauth_configured": s.oauthConfigured(),
			"in_cluster":       inCluster,
			"no_local_agent":   noLocalAgent,
			"suppress_optional_pollers": s.config.SuppressOptionalPollers,
			"install_method":   detectInstallMethod(inCluster),
			"project":          s.config.ConsoleProject,
			"workloads": fiber.Map{
				"quantum_kc_demo_available": s.isQuantumWorkloadRunning(),
			},
			"branding": fiber.Map{
				"appName":            s.config.BrandAppName,
				"appShortName":       s.config.BrandAppShortName,
				"tagline":            s.config.BrandTagline,
				"logoUrl":            s.config.BrandLogoURL,
				"faviconUrl":         s.config.BrandFaviconURL,
				"themeColor":         s.config.BrandThemeColor,
				"docsUrl":            s.config.BrandDocsURL,
				"communityUrl":       s.config.BrandCommunityURL,
				"websiteUrl":         s.config.BrandWebsiteURL,
				"issuesUrl":          s.config.BrandIssuesURL,
				"repoUrl":            s.config.BrandRepoURL,
				"hostedDomain":       s.config.BrandHostedDomain,
				"showStarDecoration": s.config.ConsoleProject == "kubestellar",
				"showAdopterNudge":   s.config.ConsoleProject == "kubestellar",
				"showDemoToLocalCTA": s.config.ConsoleProject == "kubestellar",
				"showRewards":        s.config.ConsoleProject == "kubestellar",
				"showLinkedInShare":  s.config.ConsoleProject == "kubestellar",
			},
		}
		if s.config.EnabledDashboards != "" {
			dashboards := strings.Split(s.config.EnabledDashboards, ",")
			trimmed := make([]string, 0, len(dashboards))
			for _, d := range dashboards {
				if t := strings.TrimSpace(d); t != "" {
					trimmed = append(trimmed, t)
				}
			}
			if len(trimmed) > 0 {
				resp["enabled_dashboards"] = trimmed
			}
		} else if presetDashboards := getProjectDashboards(s.config.ConsoleProject); presetDashboards != nil {
			resp["enabled_dashboards"] = presetDashboards
		}
		return c.JSON(resp)
	})

	// Version endpoint — lightweight, returns only build metadata.
	// In dev mode (go run), VCS info from debug.ReadBuildInfo() may be empty,
	// so we fall back to git commands for commit and time.
	s.app.Get("/api/version", func(c *fiber.Ctx) error {
		gitCommit := buildInfo.VCSRevision
		gitTime := buildInfo.VCSTime
		gitDirty := buildInfo.VCSModified == "true"

		if gitCommit == "" {
			gitCommit = gitFallbackRevision()
		}
		if gitTime == "" {
			gitTime = gitFallbackTime()
		}

		return c.JSON(fiber.Map{
			"version":    Version,
			"go_version": buildInfo.GoVersion,
			"git_commit": gitCommit,
			"git_time":   gitTime,
			"git_dirty":  gitDirty,
		})
	})
}
