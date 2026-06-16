package handlers

import (
	"net/http"
	"testing"

	"github.com/gofiber/fiber/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// ---------- ExtractHost ----------

func TestExtractHost_FullURL(t *testing.T) {
	host, err := ExtractHost("https://github.com/kubestellar/console")
	require.NoError(t, err)
	assert.Equal(t, "github.com", host)
}

func TestExtractHost_BareHost(t *testing.T) {
	host, err := ExtractHost("github.com")
	require.NoError(t, err)
	assert.Equal(t, "github.com", host)
}

func TestExtractHost_HTTPScheme(t *testing.T) {
	host, err := ExtractHost("http://example.internal:8080/path")
	require.NoError(t, err)
	assert.Equal(t, "example.internal", host)
}

func TestExtractHost_UpperCase(t *testing.T) {
	host, err := ExtractHost("HTTPS://GitHub.COM")
	require.NoError(t, err)
	assert.Equal(t, "github.com", host, "host should be lowercased")
}

func TestExtractHost_Empty(t *testing.T) {
	_, err := ExtractHost("")
	assert.Error(t, err)
}

func TestExtractHost_Whitespace(t *testing.T) {
	_, err := ExtractHost("   ")
	assert.Error(t, err)
}

func TestExtractHost_WhitespaceAround(t *testing.T) {
	host, err := ExtractHost("  https://example.com  ")
	require.NoError(t, err)
	assert.Equal(t, "example.com", host)
}

// ---------- GetEnvOrDefault ----------

func TestGetEnvOrDefault_Set(t *testing.T) {
	t.Setenv("TEST_SHARED_UTILS_KEY", "custom-value")
	assert.Equal(t, "custom-value", GetEnvOrDefault("TEST_SHARED_UTILS_KEY", "fallback"))
}

func TestGetEnvOrDefault_Unset(t *testing.T) {
	assert.Equal(t, "fallback", GetEnvOrDefault("TEST_SHARED_UTILS_NONEXISTENT_KEY_12345", "fallback"))
}

func TestGetEnvOrDefault_EmptyString(t *testing.T) {
	t.Setenv("TEST_SHARED_UTILS_EMPTY", "")
	assert.Equal(t, "default", GetEnvOrDefault("TEST_SHARED_UTILS_EMPTY", "default"),
		"empty env var should return default")
}

// ---------- ResolveGitHubAPIBase ----------

func TestResolveGitHubAPIBase_Default(t *testing.T) {
	t.Setenv("GITHUB_URL", "")
	assert.Equal(t, "https://api.github.com", ResolveGitHubAPIBase())
}

func TestResolveGitHubAPIBase_PublicGitHub(t *testing.T) {
	t.Setenv("GITHUB_URL", "https://github.com")
	assert.Equal(t, "https://api.github.com", ResolveGitHubAPIBase())
}

func TestResolveGitHubAPIBase_PublicGitHubBareHost(t *testing.T) {
	t.Setenv("GITHUB_URL", "github.com")
	assert.Equal(t, "https://api.github.com", ResolveGitHubAPIBase())
}

func TestResolveGitHubAPIBase_PublicWWW(t *testing.T) {
	t.Setenv("GITHUB_URL", "https://www.github.com")
	assert.Equal(t, "https://api.github.com", ResolveGitHubAPIBase())
}

func TestResolveGitHubAPIBase_PublicAPIHost(t *testing.T) {
	t.Setenv("GITHUB_URL", "https://api.github.com")
	assert.Equal(t, "https://api.github.com", ResolveGitHubAPIBase())
}

func TestResolveGitHubAPIBase_GHE(t *testing.T) {
	t.Setenv("GITHUB_URL", "https://github.example.com")
	assert.Equal(t, "https://github.example.com/api/v3", ResolveGitHubAPIBase())
}

func TestResolveGitHubAPIBase_GHETrailingSlash(t *testing.T) {
	t.Setenv("GITHUB_URL", "https://github.example.com/")
	assert.Equal(t, "https://github.example.com/api/v3", ResolveGitHubAPIBase())
}

func TestResolveGitHubAPIBase_GHEBareHost(t *testing.T) {
	t.Setenv("GITHUB_URL", "ghe.corp.internal")
	assert.Equal(t, "https://ghe.corp.internal/api/v3", ResolveGitHubAPIBase())
}

// ---------- ParsePageParams ----------

func TestParsePageParams_Defaults(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		limit, offset, err := ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.JSON(fiber.Map{"limit": limit, "offset": offset})
	})

	req, _ := http.NewRequest("GET", "/test", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
}

func TestParsePageParams_ValidValues(t *testing.T) {
	app := fiber.New()
	var gotLimit, gotOffset int
	app.Get("/test", func(c *fiber.Ctx) error {
		var err error
		gotLimit, gotOffset, err = ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, _ := http.NewRequest("GET", "/test?limit=50&offset=10", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 50, gotLimit)
	assert.Equal(t, 10, gotOffset)
}

func TestParsePageParams_NegativeLimit(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		_, _, err := ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, _ := http.NewRequest("GET", "/test?limit=-1", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestParsePageParams_NegativeOffset(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		_, _, err := ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, _ := http.NewRequest("GET", "/test?offset=-5", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestParsePageParams_NonNumericLimit(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		_, _, err := ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, _ := http.NewRequest("GET", "/test?limit=abc", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestParsePageParams_LimitTooLarge(t *testing.T) {
	app := fiber.New()
	app.Get("/test", func(c *fiber.Ctx) error {
		_, _, err := ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, _ := http.NewRequest("GET", "/test?limit=9999", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
}

func TestParsePageParams_ZeroLimit(t *testing.T) {
	app := fiber.New()
	var gotLimit int
	app.Get("/test", func(c *fiber.Ctx) error {
		var err error
		gotLimit, _, err = ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, _ := http.NewRequest("GET", "/test?limit=0", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 0, gotLimit)
}

func TestParsePageParams_MaxLimit(t *testing.T) {
	app := fiber.New()
	var gotLimit int
	app.Get("/test", func(c *fiber.Ctx) error {
		var err error
		gotLimit, _, err = ParsePageParams(c)
		if err != nil {
			return err
		}
		return c.SendStatus(fiber.StatusOK)
	})

	req, _ := http.NewRequest("GET", "/test?limit=1000", nil)
	resp, err := app.Test(req, 5000)
	require.NoError(t, err)
	assert.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Equal(t, 1000, gotLimit)
}
