package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetGitHubRewards(t *testing.T) {
	env := setupTestEnv(t)

	// Inject githubLogin into locals for testing
	env.App.Use(func(c *fiber.Ctx) error {
		c.Locals("githubLogin", "test-user")
		return c.Next()
	})

	handler := NewRewardsHandler(RewardsConfig{
		GitHubToken: "fake-token",
		Orgs:        "repo:kubestellar/console",
	})

	env.App.Get("/api/rewards/github", handler.GetGitHubRewards)

	// Since we don't want to make real GitHub API calls, we'll check the error case
	// or try to mock the httpClient if needed.
	// For now, let's verify it returns 503 if GitHub is unreachable (default behavior with fake token).

	req, err := http.NewRequest("GET", "/api/rewards/github", nil)
	require.NoError(t, err)

	resp, err := env.App.Test(req, 5000)
	require.NoError(t, err)

	// It should return 503 Service Unavailable because the fake token/API call fails
	assert.Equal(t, 503, resp.StatusCode)

	var result map[string]interface{}
	body, _ := io.ReadAll(resp.Body)
	json.Unmarshal(body, &result)
	assert.Equal(t, "GitHub API unavailable", result["error"])
}

func TestParseRepos(t *testing.T) {
	tests := []struct {
		orgs     string
		expected []string
	}{
		{"repo:kubestellar/console", []string{"kubestellar/console"}},
		{"repo:kubestellar/console repo:kubestellar/kubestellar", []string{"kubestellar/console", "kubestellar/kubestellar"}},
		{"org:kubestellar", []string{}},
		{"repo:kubestellar/console some-other-token", []string{"kubestellar/console"}},
	}

	for _, tt := range tests {
		actual := parseRepos(tt.orgs)
		assert.Equal(t, tt.expected, actual)
	}
}
