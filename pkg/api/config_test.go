package api

import (
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestResolveMaxBodyBytesDefaults(t *testing.T) {
	t.Setenv(envMaxBodyBytes, "")

	if got := resolveMaxBodyBytes(); got != defaultMaxBodyBytes {
		t.Fatalf("resolveMaxBodyBytes() = %d, want %d", got, defaultMaxBodyBytes)
	}
}

func TestResolveMaxBodyBytesRejectsInvalidOverride(t *testing.T) {
	t.Setenv(envMaxBodyBytes, "invalid")

	if got := resolveMaxBodyBytes(); got != defaultMaxBodyBytes {
		t.Fatalf("resolveMaxBodyBytes() = %d, want %d", got, defaultMaxBodyBytes)
	}
}

func TestResolveMaxBodyBytesUsesOverride(t *testing.T) {
	const overrideBytes = 20 * 1024 * 1024
	t.Setenv(envMaxBodyBytes, "20971520")

	if got := resolveMaxBodyBytes(); got != overrideBytes {
		t.Fatalf("resolveMaxBodyBytes() = %d, want %d", got, overrideBytes)
	}
}

func TestLoadConfigFromEnv_DoesNotAutoEnableDevMode(t *testing.T) {
	t.Setenv("PORT", "")
	t.Setenv("BACKEND_PORT", "")
	t.Setenv("DATABASE_PATH", "")
	t.Setenv("KUBECONFIG", "")
	t.Setenv("DEV_MODE", "")
	t.Setenv("FRONTEND_URL", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("KC_AGENT_TOKEN", "")
	t.Setenv("GITHUB_URL", "")
	t.Setenv("DEV_USER_LOGIN", "")
	t.Setenv("DEV_USER_EMAIL", "")
	t.Setenv("DEV_USER_AVATAR", "")
	t.Setenv("AUTH_ALLOWED_GITHUB_LOGINS", "")
	t.Setenv("AUTH_ADMIN_GITHUB_LOGINS", "")
	t.Setenv("CLAUDE_API_KEY", "")
	t.Setenv("KUBESTELLAR_OPS_PATH", "")
	t.Setenv("KUBESTELLAR_DEPLOY_PATH", "")
	t.Setenv("GITHUB_WEBHOOK_SECRET", "")
	t.Setenv("FEEDBACK_REPO_OWNER", "")
	t.Setenv("FEEDBACK_REPO_NAME", "")
	t.Setenv("REWARDS_GITHUB_ORGS", "")
	t.Setenv("GOOGLE_DRIVE_API_KEY", "")
	t.Setenv("BENCHMARK_FOLDER_ID", "")
	t.Setenv("KUBARA_CATALOG_REPO", "")
	t.Setenv("KUBARA_CATALOG_PATH", "")
	t.Setenv("GITHUB_TOKEN", "")
	t.Setenv("GH_TOKEN", "")
	t.Setenv("GITHUB_CLIENT_ID", "")
	t.Setenv("GITHUB_CLIENT_SECRET", "")

	testCases := []struct {
		name     string
		clientID string
		secret   string
	}{
		{
			name:     "oauth configured",
			clientID: "client-id-123456",
			secret:   "client-secret-1234567890",
		},
		{
			name:     "oauth missing",
			clientID: "",
			secret:   "",
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("GITHUB_CLIENT_ID", tc.clientID)
			t.Setenv("GITHUB_CLIENT_SECRET", tc.secret)

			cfg := LoadConfigFromEnv()
			assert.False(t, cfg.DevMode,
				"dev mode must stay disabled unless explicitly opted in with DEV_MODE=true")
		})
	}
}

func TestLoadConfigFromEnv_LoadsGitHubLoginGateConfig(t *testing.T) {
	t.Setenv("GITHUB_CLIENT_ID", "client-id-123456")
	t.Setenv("GITHUB_CLIENT_SECRET", "client-secret-1234567890")
	t.Setenv("AUTH_ALLOWED_GITHUB_LOGINS", "canary-user, teammate")
	t.Setenv("AUTH_ADMIN_GITHUB_LOGINS", "canary-user")

	cfg := LoadConfigFromEnv()

	assert.Equal(t, "canary-user, teammate", cfg.AllowedGitHubLogins)
	assert.Equal(t, "canary-user", cfg.AdminGitHubLogins)
}

func TestNewServer_ExplicitDevModeStartsWithoutOAuth(t *testing.T) {
	cfg := Config{
		ServerConfig: ServerConfig{
			Port:         0,
			DatabasePath: filepath.Join(t.TempDir(), "console.db"),
			DevMode:      true,
		},
		AuthConfig: AuthConfig{
			JWTSecret: "test-jwt-secret",
		},
	}

	server, err := NewServer(cfg)
	require.NoError(t, err,
		"explicit dev mode should allow the server to initialize without OAuth credentials")
	require.NotNil(t, server)
	assert.True(t, server.config.DevMode,
		"server config must preserve explicit dev mode")
	assert.NotNil(t, server.app, "server should initialize its Fiber app")

	t.Cleanup(func() {
		require.NoError(t, server.Shutdown())
	})
}
