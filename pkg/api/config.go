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

	// feedbackAttachmentLimitBytes matches the frontend's advertised per-file
	// video limit. Feedback requests submit screenshots/videos as base64 data
	// URIs, so the HTTP request body must allow for base64 expansion plus JSON.
	feedbackAttachmentLimitBytes       = 10 * 1024 * 1024 // 10 MB raw attachment size
	feedbackBase64ExpansionNumerator   = 4
	feedbackBase64ExpansionDenominator = 3
	feedbackJSONOverheadBytes          = 1 * 1024 * 1024 // issue fields, diagnostics, and data-URI prefixes
	feedbackGuardHeadroomBytes         = 256 * 1024

	// feedbackBodyLimit is the explicit request-size ceiling enforced by the
	// feedback route. It allows one 10 MB attachment after base64 expansion,
	// plus JSON metadata, and returns a clear 413 message when exceeded.
	feedbackBodyLimit = ((feedbackAttachmentLimitBytes*feedbackBase64ExpansionNumerator)+(feedbackBase64ExpansionDenominator-1))/feedbackBase64ExpansionDenominator + feedbackJSONOverheadBytes

	// defaultMaxBodyBytes is the global Fiber BodyLimit. Keep it slightly above
	// feedbackBodyLimit so the feedback route can return a descriptive 413
	// instead of the connection being reset by the framework while reading.
	defaultMaxBodyBytes = feedbackBodyLimit + feedbackGuardHeadroomBytes

	// envMaxBodyBytes is the environment variable that overrides the global
	// Fiber BodyLimit applied to every HTTP request (#9891). When unset or
	// invalid, the server falls back to defaultMaxBodyBytes so feedback uploads
	// continue to work. Larger deployments can raise this for big form posts;
	// smaller appliances can lower it to tighten the DoS surface.
	envMaxBodyBytes = "MAX_BODY_BYTES"
)

// ServerConfig holds infrastructure and runtime configuration
type ServerConfig struct {
	Port              int
	BackendPort       int    // Watchdog support: when set, the backend listens on this port instead of Port
	DatabasePath      string
	Kubeconfig        string
	DevMode           bool
	SkipOnboarding    bool
	EnabledDashboards string // Comma-separated list of dashboard IDs to show in sidebar (empty = all)
	ConsoleProject    string // White-label project context (e.g., "kubestellar", "crossplane", "istio")
	NoLocalAgent        bool // Suppress local kc-agent connections in in-cluster deployments
	DisableDynamicCards bool // Remove 'unsafe-eval' from CSP by disabling the dynamic cards feature
}

// AuthConfig holds authentication and authorization configuration
type AuthConfig struct {
	GitHubClientID  string
	GitHubSecret    string
	GitHubURL       string // GitHub base URL (e.g., "https://github.ibm.com"), defaults to "https://github.com"
	JWTSecret       string
	AgentToken      string // Shared secret for authenticating with kc-agent
	BootstrapToken  string // CONSOLE_BOOTSTRAP_TOKEN — required to access manifest bootstrap flow (CWE-306 mitigation)
	DevUserLogin    string // Dev mode user settings (used when GitHub OAuth not configured)
	DevUserEmail    string
	DevUserAvatar   string
}

// BrandConfig holds white-label branding configuration
type BrandConfig struct {
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
}

// IntegrationsConfig holds external service integrations
type IntegrationsConfig struct {
	FrontendURL           string
	ClaudeAPIKey          string
	KubestellarOpsPath    string
	KubestellarDeployPath string
	// GitHub integrations
	GitHubToken         string // Consolidated GitHub PAT for all GitHub operations
	GitHubWebhookSecret string // Secret for validating GitHub webhooks
	FeedbackRepoOwner   string // GitHub org/owner (e.g., "kubestellar")
	FeedbackRepoName    string // GitHub repo name (e.g., "console")
	RewardsGitHubOrgs   string // Org filter for GitHub search (e.g., "org:kubestellar org:llm-d")
	// Google Drive benchmark data
	BenchmarkGoogleDriveAPIKey string // API key for fetching benchmark data from Google Drive
	BenchmarkFolderID          string // Google Drive folder ID containing benchmark results
	// Kubara platform catalog
	KubaraCatalogRepo string // GitHub owner/name of the catalog repo (e.g. "my-org/my-catalog")
	KubaraCatalogPath string // Directory path inside the repo containing Helm chart subdirectories
}

// Config holds server configuration (composed of sub-configs for backward compatibility)
type Config struct {
	ServerConfig
	AuthConfig
	BrandConfig
	IntegrationsConfig
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

	// SECURITY (#17179): Refuse to start with DEV_MODE=true inside a Kubernetes
	// pod unless the operator explicitly acknowledges the risk. DEV_MODE disables
	// JWT auth on /api/mcp/clusters and WebSocket origin validation, which is
	// safe for local development but dangerous in a production cluster.
	//
	// KUBERNETES_SERVICE_HOST is injected automatically into every pod by the
	// kubelet — its presence reliably signals an in-cluster environment.
	// Set ALLOW_DEV_MODE_IN_CLUSTER=true to override for intentional dev
	// clusters that happen to run inside Kubernetes (e.g., kind on CI).
	if devMode && os.Getenv("KUBERNETES_SERVICE_HOST") != "" && os.Getenv("ALLOW_DEV_MODE_IN_CLUSTER") != "true" {
		slog.Error("[Config] SECURITY: DEV_MODE=true detected inside a Kubernetes pod. "+
			"Dev mode disables JWT authentication on cluster-discovery endpoints. "+
			"This is unsafe in a shared or production cluster. "+
			"Set ALLOW_DEV_MODE_IN_CLUSTER=true only if you intentionally run a dev build inside Kubernetes.",
			"fix", "Remove DEV_MODE=true from your deployment manifest, or set ALLOW_DEV_MODE_IN_CLUSTER=true")
		os.Exit(1)
	}
	if devMode {
		slog.Warn("[Config] DEV_MODE is enabled — JWT auth bypasses are active. NEVER deploy to production.")
	}

	// SECURITY (#16615): Dev mode must be explicitly opted-in via DEV_MODE=true.
	// Previously, missing OAuth credentials auto-activated dev mode, granting
	// unauthenticated admin access on misconfigured deployments (CWE-489).
	// Now: if OAuth is unconfigured and DEV_MODE is not "true", the server
	// starts in OAuth mode and the manifest setup flow guides the user.
	githubClientID := os.Getenv("GITHUB_CLIENT_ID")
	githubSecret := os.Getenv("GITHUB_CLIENT_SECRET")
	if !devMode && githubClientID == "" && githubSecret == "" && devModeEnv != "false" {
		slog.Error("[Config] SECURITY: No OAuth credentials configured and DEV_MODE is not set. "+
			"The console will start in OAuth mode (manifest setup flow). "+
			"Set DEV_MODE=true explicitly if you intend to run without authentication.",
			"solution", "Either configure GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET, or set DEV_MODE=true for development.")
	}

	// Validate OAuth credentials when OAuth mode is active (#14850).
	// Warn about misconfiguration early so users don't discover it only when
	// the GitHub token exchange fails with "invalid client credentials".
	if !devMode && devModeEnv == "false" {
		// DEV_MODE explicitly disabled — OAuth is required
		if githubClientID == "" {
			slog.Error("[Config] GITHUB_CLIENT_ID is not set. OAuth login will fail.",
				"solution", "Create a GitHub OAuth App at https://github.com/settings/developers and add GITHUB_CLIENT_ID to your .env file.",
				"docs", "See README.md section 'Setting up GitHub OAuth (self-hosted only)'")
		}
		if githubSecret == "" {
			slog.Error("[Config] GITHUB_CLIENT_SECRET is not set. OAuth login will fail.",
				"solution", "Add GITHUB_CLIENT_SECRET from your GitHub OAuth App to your .env file.",
				"docs", "See README.md section 'Setting up GitHub OAuth (self-hosted only)'")
		}
		if githubClientID != "" && githubSecret != "" {
			// Both are set — validate format (basic sanity check)
			if len(githubClientID) < 10 {
				slog.Warn("[Config] GITHUB_CLIENT_ID looks too short (< 10 chars). Verify it matches your GitHub OAuth App Client ID.")
			}
			if len(githubSecret) < 20 {
				slog.Warn("[Config] GITHUB_CLIENT_SECRET looks too short (< 20 chars). Verify it matches your GitHub OAuth App Client Secret.")
			}
		}
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
		ServerConfig: ServerConfig{
			Port:              port,
			BackendPort:       backendPort,
			DatabasePath:      dbPath,
			Kubeconfig:        os.Getenv("KUBECONFIG"),
			DevMode:           devMode,
			SkipOnboarding:    os.Getenv("SKIP_ONBOARDING") == "true",
			EnabledDashboards: os.Getenv("ENABLED_DASHBOARDS"),
			ConsoleProject:    getEnvOrDefault("CONSOLE_PROJECT", "kubestellar"),
			NoLocalAgent:        os.Getenv("NO_LOCAL_AGENT") == "true",
			DisableDynamicCards: os.Getenv("DISABLE_DYNAMIC_CARDS") == "true",
		},
		AuthConfig: AuthConfig{
			GitHubClientID: githubClientID,
			GitHubSecret:   githubSecret,
			GitHubURL:      getEnvOrDefault("GITHUB_URL", "https://github.com"),
			JWTSecret:      jwtSecret,
			AgentToken:     os.Getenv("KC_AGENT_TOKEN"),
			BootstrapToken: os.Getenv("CONSOLE_BOOTSTRAP_TOKEN"),
			DevUserLogin:   getEnvOrDefault("DEV_USER_LOGIN", "dev-user"),
			DevUserEmail:   getEnvOrDefault("DEV_USER_EMAIL", "dev@localhost"),
			DevUserAvatar:  getEnvOrDefault("DEV_USER_AVATAR", ""),
		},
		BrandConfig: BrandConfig{
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
		},
		IntegrationsConfig: IntegrationsConfig{
			FrontendURL:                frontendURL,
			ClaudeAPIKey:               os.Getenv("CLAUDE_API_KEY"),
			KubestellarOpsPath:         getEnvOrDefault("KUBESTELLAR_OPS_PATH", "kubestellar-ops"),
			KubestellarDeployPath:      getEnvOrDefault("KUBESTELLAR_DEPLOY_PATH", "kubestellar-deploy"),
			GitHubToken:                resolveGitHubToken(),
			GitHubWebhookSecret:        os.Getenv("GITHUB_WEBHOOK_SECRET"),
			FeedbackRepoOwner:          getEnvOrDefault("FEEDBACK_REPO_OWNER", "kubestellar"),
			FeedbackRepoName:           getEnvOrDefault("FEEDBACK_REPO_NAME", "console"),
			RewardsGitHubOrgs:          getEnvOrDefault("REWARDS_GITHUB_ORGS", "repo:kubestellar/console repo:kubestellar/console-marketplace repo:kubestellar/console-kb repo:kubestellar/docs"),
			BenchmarkGoogleDriveAPIKey: os.Getenv("GOOGLE_DRIVE_API_KEY"),
			BenchmarkFolderID:          getEnvOrDefault("BENCHMARK_FOLDER_ID", "1r2Z2Xp1L0KonUlvQHvEzed8AO9Xj8IPm"),
			KubaraCatalogRepo:          os.Getenv("KUBARA_CATALOG_REPO"),
			KubaraCatalogPath:          os.Getenv("KUBARA_CATALOG_PATH"),
		},
	}
}

func resolveGitHubToken() string {
	token := settings.ResolveGitHubTokenEnv()
	if token == "" {
		if sm := settings.GetSettingsManager(); sm != nil {
			if all, err := sm.GetAll(); err == nil && all.FeedbackGitHubToken != "" {
				token = all.FeedbackGitHubToken
				slog.Info("[config] GitHub token resolved from settings DB", "length", len(token))
			}
		}
	}
	if token == "" {
		slog.Warn("[config] GitHub token is EMPTY — GitHub API calls will fail")
	}
	return token
}

func getEnvOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// resolveMaxBodyBytes returns the global Fiber BodyLimit in bytes.
// It reads the envMaxBodyBytes environment variable and falls back to
// defaultMaxBodyBytes when the value is unset, non-numeric, or non-positive.
// This is the canonical cap that rejects oversized payloads before Fiber
// buffers them, mitigating memory-exhaustion DoS (#9891).
func resolveMaxBodyBytes() int {
	raw := os.Getenv(envMaxBodyBytes)
	if raw == "" {
		return defaultMaxBodyBytes
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		slog.Warn("invalid MAX_BODY_BYTES env var; using default",
			"value", raw, "default_bytes", defaultMaxBodyBytes)
		return defaultMaxBodyBytes
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
