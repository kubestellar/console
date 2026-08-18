package rewards

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// interceptTransport routes every request through a single httptest server,
// regardless of the original URL. This lets tests exercise the code path
// against api.github.com without touching the network.
type interceptTransport struct {
	baseURL string
}

func (i *interceptTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Preserve path + query so listRepoItems' /repos/{repo}/issues... lands
	// on the mock server.
	rewritten := i.baseURL + req.URL.RequestURI()
	newReq, err := http.NewRequestWithContext(req.Context(), req.Method, rewritten, req.Body)
	if err != nil {
		return nil, err
	}
	newReq.Header = req.Header.Clone()
	return http.DefaultTransport.RoundTrip(newReq)
}

func TestGetGitHubRewards(t *testing.T) {
	// #22615 — the previous version of this test called the real
	// api.github.com and timed out at 5s. Now we install a mock server that
	// returns 500 so the handler's error path (503 "GitHub API unavailable")
	// is exercised deterministically.
	mockAPI := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.Contains(r.URL.Path, "/issues") {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer mockAPI.Close()

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
	// Redirect every outbound request to the mock server.
	handler.httpClient = &http.Client{Transport: &interceptTransport{baseURL: mockAPI.URL}}

	env.App.Get("/api/rewards/github", handler.GetGitHubRewards)

	req, err := http.NewRequest("GET", "/api/rewards/github", nil)
	require.NoError(t, err)
	req.Host = "localhost"

	resp, err := env.App.Test(req, 10000)
	require.NoError(t, err)

	// The mock server 500s every request so fetchUserRewards fails and the
	// handler surfaces the 503 error path.
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
