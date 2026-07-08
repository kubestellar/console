package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const parsePageParamsRoute = "/page-params"

type pageParamsResponse struct {
	Limit  int `json:"limit"`
	Offset int `json:"offset"`
}

func newParsePageParamsTestApp(t *testing.T) *fiber.App {
	t.Helper()

	app := fiber.New()
	app.Get(parsePageParamsRoute, func(c *fiber.Ctx) error {
		limit, offset, err := ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.JSON(pageParamsResponse{Limit: limit, Offset: offset})
	})

	return app
}

func TestParsePageParams(t *testing.T) {
	app := newParsePageParamsTestApp(t)
	limitTooLarge := maxClientPageLimit + 1

	tests := []struct {
		name          string
		query         string
		wantStatus    int
		wantResponse  *pageParamsResponse
		wantBodyParts []string
	}{
		{
			name:         "uses defaults when query parameters are absent",
			query:        "",
			wantStatus:   http.StatusOK,
			wantResponse: &pageParamsResponse{Limit: 0, Offset: 0},
		},
		{
			name:         "accepts zero and boundary values",
			query:        "?limit=1000&offset=0",
			wantStatus:   http.StatusOK,
			wantResponse: &pageParamsResponse{Limit: maxClientPageLimit, Offset: 0},
		},
		{
			name:         "accepts positive values",
			query:        "?limit=25&offset=12",
			wantStatus:   http.StatusOK,
			wantResponse: &pageParamsResponse{Limit: 25, Offset: 12},
		},
		{
			name:          "rejects negative limit",
			query:         "?limit=-1",
			wantStatus:    http.StatusBadRequest,
			wantBodyParts: []string{"invalid limit"},
		},
		{
			name:          "rejects non numeric limit",
			query:         "?limit=abc",
			wantStatus:    http.StatusBadRequest,
			wantBodyParts: []string{"invalid limit"},
		},
		{
			name:          "rejects oversized limit",
			query:         "?limit=" + strconv.Itoa(limitTooLarge),
			wantStatus:    http.StatusBadRequest,
			wantBodyParts: []string{"limit too large"},
		},
		{
			name:          "rejects negative offset",
			query:         "?offset=-5",
			wantStatus:    http.StatusBadRequest,
			wantBodyParts: []string{"invalid offset"},
		},
		{
			name:          "rejects non numeric offset",
			query:         "?offset=bad",
			wantStatus:    http.StatusBadRequest,
			wantBodyParts: []string{"invalid offset"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, parsePageParamsRoute+tt.query, nil)
			req.Host = "localhost"
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			assert.Equal(t, tt.wantStatus, resp.StatusCode)
			if tt.wantResponse != nil {
				var got pageParamsResponse
				require.NoError(t, json.NewDecoder(resp.Body).Decode(&got))
				assert.Equal(t, *tt.wantResponse, got)
				return
			}

			bodyBytes, err := io.ReadAll(resp.Body)
			require.NoError(t, err)
			body := string(bodyBytes)
			for _, wantBodyPart := range tt.wantBodyParts {
				assert.Contains(t, body, wantBodyPart)
			}
		})
	}
}

func TestResolveGitHubAPIBase(t *testing.T) {
	originalValue, hadOriginal := os.LookupEnv("GITHUB_URL")
	if hadOriginal {
		defer func() {
			require.NoError(t, os.Setenv("GITHUB_URL", originalValue))
		}()
	} else {
		defer func() {
			require.NoError(t, os.Unsetenv("GITHUB_URL"))
		}()
	}

	tests := []struct {
		name      string
		githubURL string
		want      string
	}{
		{
			name:      "defaults to public github api when env is unset",
			githubURL: "",
			want:      githubAPIBase,
		},
		{
			name:      "maps bare github host to public api",
			githubURL: "github.com",
			want:      githubAPIBase,
		},
		{
			name:      "maps www github host to public api",
			githubURL: " https://www.github.com/ ",
			want:      githubAPIBase,
		},
		{
			name:      "appends ghe api path for bare enterprise host",
			githubURL: "github.enterprise.example.com",
			want:      "https://github.enterprise.example.com/api/v3",
		},
		{
			name:      "preserves http scheme for enterprise host",
			githubURL: "http://ghe.example.com/",
			want:      "http://ghe.example.com/api/v3",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.githubURL == "" {
				require.NoError(t, os.Unsetenv("GITHUB_URL"))
			} else {
				require.NoError(t, os.Setenv("GITHUB_URL", tt.githubURL))
			}

			assert.Equal(t, tt.want, ResolveGitHubAPIBase())
		})
	}
}

func TestExtractHost(t *testing.T) {
	tests := []struct {
		name    string
		raw     string
		want    string
		wantErr bool
	}{
		{
			name: "extracts lowercase hostname from full url",
			raw:  "https://GitHub.example.com:8443/api/v3",
			want: "github.example.com",
		},
		{
			name: "extracts lowercase hostname from bare host",
			raw:  "GITHUB.COM",
			want: "github.com",
		},
		{
			name:    "rejects empty input",
			raw:     "   ",
			wantErr: true,
		},
		{
			name:    "rejects malformed urls",
			raw:     "http://[::1",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := ExtractHost(tt.raw)
			if tt.wantErr {
				assert.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestGetEnvOrDefault(t *testing.T) {
	t.Setenv("SHARED_UTILS_TEST_VALUE", "configured")
	t.Setenv("SHARED_UTILS_EMPTY_VALUE", "")

	assert.Equal(t, "configured", GetEnvOrDefault("SHARED_UTILS_TEST_VALUE", "fallback"))
	assert.Equal(t, "fallback", GetEnvOrDefault("SHARED_UTILS_MISSING_VALUE", "fallback"))
	assert.Equal(t, "fallback", GetEnvOrDefault("SHARED_UTILS_EMPTY_VALUE", "fallback"))
}
