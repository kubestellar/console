package api

import (
"log/slog"
"os"
"sort"
"strconv"

"github.com/kubestellar/console/pkg/settings"
)

const (
	// apiDefaultBodyLimit is the per-route body-size limit enforced by the
	// bodyGuard middleware on all API routes except feedback screenshot uploads.
	apiDefaultBodyLimit = 1 * 1024 * 1024 // 1 MB — sufficient for JSON API requests

	// feedbackBodyLimit is the global Fiber BodyLimit, elevated to support
	// base64-encoded screenshot uploads in POST /api/feedback/requests.
	// Reduced from 20 MB to 5 MB to limit memory-based DoS surface (#9710).
	feedbackBodyLimit = 5 * 1024 * 1024 // 5 MB — base64 screenshot uploads

	// envMaxBodyBytes is the environment variable that overrides the global
	// Fiber BodyLimit applied to every HTTP request (#9891). When unset or
	// invalid, the server falls back to feedbackBodyLimit so feedback screenshot
	// uploads continue to work. Larger deployments can raise this for big
	// form posts; smaller appliances can lower it to tighten DoS surface.
	envMaxBodyBytes = "MAX_BODY_BYTES"
)

// Config holds server configuration
type Config struct {
	Port                  int
	DevMode               bool
	SkipOnboarding        bool
	DatabasePath          string
	GitHubClientID        string
	GitHubSecret          string
	GitHubURL             string // GitHub base URL (e.g., "https://github.ibm.com"), defaults to "https://github.com"
	JWTSecret             string
	FrontendURL           string
	ClaudeAPIKey          string
	KubestellarOpsPath    string
	KubestellarDeployPath string
	Kubeconfig            string
	// Dev mode user settings (used when GitHub OAuth not configured)
	DevUserLogin  string
	DevUserEmail  string
	DevUserAvatar string
	// GitHubToken is the consolidated GitHub PAT used for all GitHub operations:
	// API proxy (activity card, CI), feedback/issue creation, missions, and rewards.
	// Resolved from FEEDBACK_GITHUB_TOKEN env var, falling back to GITHUB_TOKEN.
	GitHubToken string
	// Feature request/feedback configuration (repo targeting, not token)
	GitHubWebhookSecret string // Secret for validating GitHub webhooks
	FeedbackRepoOwner   string // GitHub org/owner (e.g., "kubestellar")
	FeedbackRepoName    string // GitHub repo name (e.g., "console")
	// GitHub activity rewards
	RewardsGitHubOrgs string // Org filter for GitHub search (e.g., "org:kubestellar org:llm-d")
	// Benchmark data configuration (Google Drive)
	BenchmarkGoogleDriveAPIKey string // API key for fetching benchmark data from Google Drive
	BenchmarkFolderID          string // Google Drive folder ID containing benchmark results
	// Sidebar configuration
	EnabledDashboards string // Comma-separated list of dashboard IDs to show in sidebar (empty = all)
	// White-label project context (e.g., "kubestellar", "crossplane", "istio")
	// Controls which project-specific cards, dashboards, and routes are active.
	// Default: "kubestellar"
	ConsoleProject string
	// White-label branding configuration
	BrandAppName      string // APP_NAME — display name (default: "KubeStellar Console")
	BrandAppShortName string // APP_SHORT_NAME — compact name (default: "KubeStellar")
	BrandTagline      string // APP_TAGLINE (default: "multi-cluster first, saving time and tokens")
	BrandLogoURL      string // LOGO_URL — path to logo image (default: "/kubestellar-logo.svg")
	BrandFaviconURL   string // FAVICON_URL (default: "/favicon.ico")
	BrandThemeColor   string // THEME_COLOR — PWA theme color (default: "#7c3aed")
	BrandDocsURL      string // DOCS_URL (default: "https://kubestellar.io/docs/console/readme")
	BrandCommunityURL string // COMMUNITY_URL (default: "https://kubestellar.io/community")
	BrandWebsiteURL   string // WEBSITE_URL (default: "https://kubestellar.io")
	BrandIssuesURL    string // ISSUES_URL (default: "https://github.com/kubestellar/kubestellar/issues/new")
	BrandRepoURL      string // REPO_URL (default: "https://github.com/kubestellar/console")
	BrandHostedDomain string // HOSTED_DOMAIN — domain for demo mode (default: "console.kubestellar.io")
	// AgentToken is the shared secret for authenticating with kc-agent.
	// startup-oauth.sh generates this and passes it to both kc-agent and
	// the Go backend via the KC_AGENT_TOKEN env var. The backend serves
	// it via GET /api/agent/token so the frontend can call kc-agent
	// endpoints that require Bearer auth.
	AgentToken string
	// Kubara platform catalog configuration
	// KubaraCatalogRepo is the GitHub owner/name of the catalog repo
	// (e.g. "my-org/my-catalog"). Defaults to "kubara-io/kubara".
	KubaraCatalogRepo string
	// KubaraCatalogPath is the directory path inside the repo containing
	// Helm chart subdirectories. Defaults to the standard Kubara path.
	KubaraCatalogPath string
	// NoLocalAgent suppresses the frontend's local kc-agent connections
	// (ws://127.0.0.1:8585). Set to true for in-cluster deployments
	// (Helm/Kubernetes) where no local kc-agent exists on the user's machine.
	// Exposed via /health as "no_local_agent" so the pre-built frontend image
	// can detect this at runtime without requiring a VITE_NO_LOCAL_AGENT rebuild.
	NoLocalAgent bool
	// Watchdog support: when set, the backend listens on this port instead of Port
	BackendPort int
}

// LoadConfigFromEnv loads configuration from environment variables
func LoadConfigFromEnv() Config {
	port := 8080
	if p := os.Getenv("PORT"); p != "" {
		if v, err := strconv.Atoi(p); err != nil {
			slog.Warn("[Server] invalid PORT, using default", "value", p, "default", port, "error", err)
		} else {
			port = v
		}
	}

	var backendPort int
	if p := os.Getenv("BACKEND_PORT"); p != "" {
		if v, err := strconv.Atoi(p); err != nil {
			slog.Warn("[Server] invalid BACKEND_PORT, ignoring", "value", p, "error", err)
		} else {
			backendPort = v
		}
	}

	dbPath := "./data/console.db"
	if p := os.Getenv("DATABASE_PATH"); p != "" {
		dbPath = p
	}

	devModeEnv := os.Getenv("DEV_MODE")
	devMode := devModeEnv == "true"

	// Defense-in-depth: auto-activate dev mode when OAuth is unconfigured (#10925).
	// Without this, a missing DEV_MODE export (e.g. older start.sh) causes the
	// auth-retry cascade: JWTAuth rejects every request → frontend retries → 429.
	// Skip auto-activation when DEV_MODE is explicitly "false" — the one-click
	// manifest flow intentionally starts with no OAuth credentials (#10931).
	githubClientID := os.Getenv("GITHUB_CLIENT_ID")
	githubSecret := os.Getenv("GITHUB_CLIENT_SECRET")
	if !devMode && devModeEnv != "false" && githubClientID == "" && githubSecret == "" {
		slog.Warn("[Config] No GitHub OAuth credentials and DEV_MODE not set — auto-activating dev mode")
		devMode = true
	}

	// Frontend URL can be explicitly set via env var
	// If not set, leave empty and compute default in NewServer based on final DevMode
	// (This allows --dev flag to override env var for frontend URL default)
	frontendURL := os.Getenv("FRONTEND_URL")

	// JWT secret - read from env, validation and default generation happens in NewServer
	// (This allows --dev flag to override env var for JWT secret default)
	jwtSecret := os.Getenv("JWT_SECRET")

	// Warn when feedback/rewards env vars are not set — forks and enterprise
	// deployments should set these to avoid routing user actions to the
	// upstream kubestellar repositories.  See #2826.
	warnDefaultEnvVars(map[string]string{
		"FEEDBACK_REPO_OWNER": "kubestellar",
		"FEEDBACK_REPO_NAME":  "console",
		"REWARDS_GITHUB_ORGS": "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs",
	})

	return Config{
		Port:                  port,
		DevMode:               devMode,
		DatabasePath:          dbPath,
		GitHubClientID:        githubClientID,
		GitHubSecret:          githubSecret,
		GitHubURL:             getEnvOrDefault("GITHUB_URL", "https://github.com"),
		JWTSecret:             jwtSecret,
		FrontendURL:           frontendURL,
		ClaudeAPIKey:          os.Getenv("CLAUDE_API_KEY"),
		KubestellarOpsPath:    getEnvOrDefault("KUBESTELLAR_OPS_PATH", "kubestellar-ops"),
		KubestellarDeployPath: getEnvOrDefault("KUBESTELLAR_DEPLOY_PATH", "kubestellar-deploy"),
		Kubeconfig:            os.Getenv("KUBECONFIG"),
		// Dev mode user settings
		DevUserLogin:  getEnvOrDefault("DEV_USER_LOGIN", "dev-user"),
		DevUserEmail:  getEnvOrDefault("DEV_USER_EMAIL", "dev@localhost"),
		DevUserAvatar: getEnvOrDefault("DEV_USER_AVATAR", ""),
		// kc-agent shared secret (generated by startup-oauth.sh)
		AgentToken: os.Getenv("KC_AGENT_TOKEN"),
		// Consolidated GitHub token (FEEDBACK_GITHUB_TOKEN preferred, GITHUB_TOKEN as alias)
		GitHubToken:         settings.ResolveGitHubTokenEnv(),
		GitHubWebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
		FeedbackRepoOwner:   getEnvOrDefault("FEEDBACK_REPO_OWNER", "kubestellar"),
		FeedbackRepoName:    getEnvOrDefault("FEEDBACK_REPO_NAME", "console"),
		// GitHub activity rewards
		RewardsGitHubOrgs: getEnvOrDefault("REWARDS_GITHUB_ORGS", "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs"),
		// Skip onboarding questionnaire for new users
		SkipOnboarding: os.Getenv("SKIP_ONBOARDING") == "true",
		// Benchmark data from Google Drive
		BenchmarkGoogleDriveAPIKey: os.Getenv("GOOGLE_DRIVE_API_KEY"),
		BenchmarkFolderID:          getEnvOrDefault("BENCHMARK_FOLDER_ID", "1r2Z2Xp1L0KonUlvQHvEzed8AO9Xj8IPm"),
		// Kubara platform catalog (optional — defaults to kubara-io/kubara public catalog)
		KubaraCatalogRepo: os.Getenv("KUBARA_CATALOG_REPO"),
		KubaraCatalogPath: os.Getenv("KUBARA_CATALOG_PATH"),
		// Sidebar dashboard filter
		EnabledDashboards: os.Getenv("ENABLED_DASHBOARDS"),
		// White-label project context
		ConsoleProject: getEnvOrDefault("CONSOLE_PROJECT", "kubestellar"),
		// White-label branding (all default to KubeStellar values)
		BrandAppName:      getEnvOrDefault("APP_NAME", "KubeStellar Console"),
		BrandAppShortName: getEnvOrDefault("APP_SHORT_NAME", "KubeStellar"),
		BrandTagline:      getEnvOrDefault("APP_TAGLINE", "multi-cluster first, saving time and tokens"),
		BrandLogoURL:      getEnvOrDefault("LOGO_URL", "/kubestellar-logo.svg"),
		BrandFaviconURL:   getEnvOrDefault("FAVICON_URL", "/favicon.ico"),
		BrandThemeColor:   getEnvOrDefault("THEME_COLOR", "#7c3aed"),
		BrandDocsURL:      getEnvOrDefault("DOCS_URL", "https://kubestellar.io/docs/console/readme"),
		BrandCommunityURL: getEnvOrDefault("COMMUNITY_URL", "https://kubestellar.io/community"),
		BrandWebsiteURL:   getEnvOrDefault("WEBSITE_URL", "https://kubestellar.io"),
		BrandIssuesURL:    getEnvOrDefault("ISSUES_URL", "https://github.com/kubestellar/kubestellar/issues/new"),
		BrandRepoURL:      getEnvOrDefault("REPO_URL", "https://github.com/kubestellar/console"),
		BrandHostedDomain: getEnvOrDefault("HOSTED_DOMAIN", "console.kubestellar.io"),
		// Suppress local kc-agent connections in in-cluster deployments
		NoLocalAgent: os.Getenv("NO_LOCAL_AGENT") == "true",
		// Watchdog backend port override
		BackendPort: backendPort,
	}
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// resolveMaxBodyBytes returns the global Fiber BodyLimit in bytes.
// It reads the envMaxBodyBytes environment variable and falls back to
// feedbackBodyLimit when the value is unset, non-numeric, or non-positive.
// This is the canonical cap that rejects oversized payloads before Fiber
// buffers them, mitigating memory-exhaustion DoS (#9891).
func resolveMaxBodyBytes() int {
	raw := os.Getenv(envMaxBodyBytes)
	if raw == "" {
		return feedbackBodyLimit
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		slog.Warn("invalid MAX_BODY_BYTES env var; using default",
			"value", raw, "default_bytes", feedbackBodyLimit)
		return feedbackBodyLimit
	}
	return n
}

// warnDefaultEnvVars logs a warning for each env var that is not explicitly
// set.  This helps fork and enterprise deployers notice that the defaults
// point to the upstream kubestellar repositories so they can override them.
func warnDefaultEnvVars(vars map[string]string) {
	keys := make([]string, 0, len(vars))
	for k := range vars {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, envVar := range keys {
		defaultVal := vars[envVar]
		if os.Getenv(envVar) == "" {
			slog.Warn("[Server] env var not set, using default — set this for fork/enterprise deployments",
				"envVar", envVar, "default", defaultVal)
		}
	}
}
