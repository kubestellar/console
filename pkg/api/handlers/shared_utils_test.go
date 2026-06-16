package handlers

import (
	"io"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParsePageParams(t *testing.T) {
	tests := []struct {
		name        string
		queryLimit  string
		queryOffset string
		wantLimit   int
		wantOffset  int
		wantErr     bool
		errContains string
	}{
		{
			name:       "NoParams",
			wantLimit:  0,
			wantOffset: 0,
			wantErr:    false,
		},
		{
			name:       "ValidLimitAndOffset",
			queryLimit: "50",
			queryOffset: "100",
			wantLimit:  50,
			wantOffset: 100,
			wantErr:    false,
		},
		{
			name:        "InvalidLimit",
			queryLimit:  "abc",
			wantErr:     true,
			errContains: "invalid limit",
		},
		{
			name:        "NegativeLimit",
			queryLimit:  "-5",
			wantErr:     true,
			errContains: "invalid limit",
		},
		{
			name:        "LimitTooLarge",
			queryLimit:  "2000",
			wantErr:     true,
			errContains: "limit too large",
		},
		{
			name:        "InvalidOffset",
			queryOffset: "xyz",
			wantErr:     true,
			errContains: "invalid offset",
		},
		{
			name:        "NegativeOffset",
			queryOffset: "-10",
			wantErr:     true,
			errContains: "invalid offset",
		},
		{
			name:       "MaxAllowedLimit",
			queryLimit: "1000",
			wantLimit:  1000,
			wantErr:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/test", func(c *fiber.Ctx) error {
				limit, offset, err := ParsePageParams(c)
				if err != nil {
					return err
				}
				return c.JSON(fiber.Map{"limit": limit, "offset": offset})
			})

			url := "/test"
			if tt.queryLimit != "" || tt.queryOffset != "" {
				url += "?"
				if tt.queryLimit != "" {
					url += "limit=" + tt.queryLimit
				}
				if tt.queryOffset != "" {
					if tt.queryLimit != "" {
						url += "&"
					}
					url += "offset=" + tt.queryOffset
				}
			}

			req := httptest.NewRequest("GET", url, nil)
			resp, err := app.Test(req)
			require.NoError(t, err)
			defer resp.Body.Close()

			if tt.wantErr {
				assert.Equal(t, fiber.StatusBadRequest, resp.StatusCode)
				body, err := io.ReadAll(resp.Body)
				require.NoError(t, err)
				assert.Contains(t, string(body), tt.errContains)
			} else {
				assert.Equal(t, fiber.StatusOK, resp.StatusCode)
				body, err := io.ReadAll(resp.Body)
				require.NoError(t, err)
				assert.Contains(t, string(body), `"limit"`)
				assert.Contains(t, string(body), `"offset"`)
			}
		})
	}
}

func TestResolveGitHubAPIBase(t *testing.T) {
	tests := []struct {
		name        string
		githubURL   string
		wantAPIBase string
	}{
		{
			name:        "EmptyEnvVar",
			githubURL:   "",
			wantAPIBase: "https://api.github.com",
		},
		{
			name:        "PublicGitHub",
			githubURL:   "https://github.com",
			wantAPIBase: "https://api.github.com",
		},
		{
			name:        "BareGitHubHost",
			githubURL:   "github.com",
			wantAPIBase: "https://api.github.com",
		},
		{
			name:        "WWWGitHub",
			githubURL:   "www.github.com",
			wantAPIBase: "https://api.github.com",
		},
		{
			name:        "APIGitHub",
			githubURL:   "api.github.com",
			wantAPIBase: "https://api.github.com",
		},
		{
			name:        "GHEWithHTTPS",
			githubURL:   "https://github.example.com",
			wantAPIBase: "https://github.example.com/api/v3",
		},
		{
			name:        "GHEBareHost",
			githubURL:   "github.example.com",
			wantAPIBase: "https://github.example.com/api/v3",
		},
		{
			name:        "GHEWithHTTP",
			githubURL:   "http://github.internal",
			wantAPIBase: "http://github.internal/api/v3",
		},
		{
			name:        "GHEWithTrailingSlash",
			githubURL:   "https://github.corp.com/",
			wantAPIBase: "https://github.corp.com/api/v3",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.githubURL != "" {
				t.Setenv("GITHUB_URL", tt.githubURL)
			} else {
				os.Unsetenv("GITHUB_URL")
			}

			result := ResolveGitHubAPIBase()
			assert.Equal(t, tt.wantAPIBase, result)
		})
	}
}

func TestExtractHost(t *testing.T) {
	tests := []struct {
		name     string
		raw      string
		wantHost string
		wantErr  bool
	}{
		{
			name:     "FullURL",
			raw:      "https://github.com/path",
			wantHost: "github.com",
			wantErr:  false,
		},
		{
			name:     "BareHost",
			raw:      "github.com",
			wantHost: "github.com",
			wantErr:  false,
		},
		{
			name:     "WithPort",
			raw:      "https://github.com:443/path",
			wantHost: "github.com",
			wantErr:  false,
		},
		{
			name:     "HTTPProtocol",
			raw:      "http://internal.corp",
			wantHost: "internal.corp",
			wantErr:  false,
		},
		{
			name:     "WithSubdomain",
			raw:      "api.github.com",
			wantHost: "api.github.com",
			wantErr:  false,
		},
		{
			name:    "EmptyString",
			raw:     "",
			wantErr: true,
		},
		{
			name:    "WhitespaceOnly",
			raw:     "   ",
			wantErr: true,
		},
		{
			name:     "LowercaseConversion",
			raw:      "GitHub.COM",
			wantHost: "github.com",
			wantErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			host, err := ExtractHost(tt.raw)
			if tt.wantErr {
				assert.Error(t, err)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tt.wantHost, host)
			}
		})
	}
}

func TestGetEnvOrDefault(t *testing.T) {
	tests := []struct {
		name       string
		key        string
		defaultVal string
		envVal     string
		wantResult string
	}{
		{
			name:       "EnvVarSet",
			key:        "TEST_VAR_1",
			defaultVal: "default",
			envVal:     "custom",
			wantResult: "custom",
		},
		{
			name:       "EnvVarEmpty",
			key:        "TEST_VAR_2",
			defaultVal: "default",
			envVal:     "",
			wantResult: "default",
		},
		{
			name:       "EnvVarUnset",
			key:        "TEST_VAR_3",
			defaultVal: "default",
			wantResult: "default",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envVal != "" {
				t.Setenv(tt.key, tt.envVal)
			} else {
				os.Unsetenv(tt.key)
			}

			result := GetEnvOrDefault(tt.key, tt.defaultVal)
			assert.Equal(t, tt.wantResult, result)
		})
	}
}
