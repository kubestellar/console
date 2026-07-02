package feedback

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// testRSAKey caches a single RSA key pair for all tests in this file.
var (
	testRSAKeyOnce sync.Once
	testRSAKey     *rsa.PrivateKey
	testRSAKeyPEM  []byte
)

func getTestRSAKey(t *testing.T) (*rsa.PrivateKey, []byte) {
	t.Helper()
	testRSAKeyOnce.Do(func() {
		var err error
		testRSAKey, err = rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			panic("failed to generate test RSA key: " + err.Error())
		}
		testRSAKeyPEM = pem.EncodeToMemory(&pem.Block{
			Type:  "RSA PRIVATE KEY",
			Bytes: x509.MarshalPKCS1PrivateKey(testRSAKey),
		})
	})
	return testRSAKey, testRSAKeyPEM
}

// ─────────────────────────────────────────────────────────────────────
// NewGitHubAppTokenProvider
// ─────────────────────────────────────────────────────────────────────

func TestNewGitHubAppTokenProvider_MissingEnvVars(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		installationID string
		privateKey     string
	}{
		{"all missing", "", "", ""},
		{"only app_id set", "12345", "", ""},
		{"only installation_id set", "", "67890", ""},
		{"only private_key set", "", "", "fake-key"},
		{"app_id and installation_id set", "12345", "67890", ""},
		{"app_id and private_key set", "12345", "", "fake-key"},
		{"installation_id and private_key set", "", "67890", "fake-key"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv(appIDEnv, tc.appID)
			t.Setenv(appInstallationIDEnv, tc.installationID)
			t.Setenv(appPrivateKeyEnv, tc.privateKey)

			provider := NewGitHubAppTokenProvider()
			assert.Nil(t, provider, "provider should be nil when credentials incomplete")
		})
	}
}

func TestNewGitHubAppTokenProvider_AllEnvVarsSet(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, string(pemBytes))

	provider := NewGitHubAppTokenProvider()
	require.NotNil(t, provider, "provider should not be nil when all credentials set")
	assert.Equal(t, "12345", provider.appID)
	assert.Equal(t, "67890", provider.installationID)
	assert.Equal(t, pemBytes, provider.privateKeyPEM)
}

// ─────────────────────────────────────────────────────────────────────
// ExpectedAppSlug
// ─────────────────────────────────────────────────────────────────────

func TestExpectedAppSlug_Default(t *testing.T) {
	t.Setenv(appSlugEnv, "")
	assert.Equal(t, DefaultConsoleAppSlug, ExpectedAppSlug())
}

func TestExpectedAppSlug_Override(t *testing.T) {
	t.Setenv(appSlugEnv, "my-custom-app")
	assert.Equal(t, "my-custom-app", ExpectedAppSlug())
}

// ─────────────────────────────────────────────────────────────────────
// signAppJWT
// ─────────────────────────────────────────────────────────────────────

func TestSignAppJWT_ValidKey(t *testing.T) {
	key, pemBytes := getTestRSAKey(t)

	provider := &GitHubAppTokenProvider{
		appID:         "99999",
		privateKeyPEM: pemBytes,
	}

	before := time.Now()
	tokenString, err := provider.signAppJWT()
	require.NoError(t, err)
	require.NotEmpty(t, tokenString)

	// Parse and validate the JWT
	parsed, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return &key.PublicKey, nil
	})
	require.NoError(t, err)
	require.True(t, parsed.Valid)

	claims, ok := parsed.Claims.(jwt.MapClaims)
	require.True(t, ok)

	// Verify issuer is appID
	iss, err := claims.GetIssuer()
	require.NoError(t, err)
	assert.Equal(t, "99999", iss)

	// Verify iat is in the past (code sets iat = now - 60s)
	iat, err := claims.GetIssuedAt()
	require.NoError(t, err)
	assert.True(t, iat.Before(before), "iat should be before test start")

	// Verify exp is in the future (code sets exp = now + appJWTLifetime)
	exp, err := claims.GetExpirationTime()
	require.NoError(t, err)
	assert.True(t, exp.After(before), "exp should be after test start")
	assert.WithinDuration(t, before.Add(appJWTLifetime), exp.Time, 5*time.Second)
}

func TestSignAppJWT_InvalidKey(t *testing.T) {
	provider := &GitHubAppTokenProvider{
		appID:         "12345",
		privateKeyPEM: []byte("not-a-valid-pem-key"),
	}

	tokenString, err := provider.signAppJWT()
	assert.Error(t, err)
	assert.Empty(t, tokenString)
	assert.Contains(t, err.Error(), "parse RSA private key")
}

// ─────────────────────────────────────────────────────────────────────
// Token (with mock HTTP server)
// ─────────────────────────────────────────────────────────────────────

func TestToken_Success(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	expiresAt := time.Now().Add(60 * time.Minute)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.True(t, strings.HasSuffix(r.URL.Path, "/app/installations/67890/access_tokens"))
		assert.True(t, strings.HasPrefix(r.Header.Get("Authorization"), "Bearer "))
		assert.Equal(t, "application/vnd.github+json", r.Header.Get("Accept"))

		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "ghs_test_installation_token_abc123",
			"expires_at": expiresAt.Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Override GITHUB_URL to point at our test server
	// resolveGitHubAPIBase() appends /api/v3 for non-github.com hosts
	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  pemBytes,
		httpClient:     server.Client(),
	}

	tok, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_test_installation_token_abc123", tok)
}

func TestToken_CacheHit(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      fmt.Sprintf("ghs_token_%d", callCount),
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  pemBytes,
		httpClient:     server.Client(),
	}

	// First call — mints a token
	tok1, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_token_1", tok1)

	// Second call — should use cache
	tok2, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_token_1", tok2)

	// Server should have been called only once
	assert.Equal(t, 1, callCount)
}

func TestToken_RefreshOnExpiry(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      fmt.Sprintf("ghs_token_%d", callCount),
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  pemBytes,
		httpClient:     server.Client(),
		// Pre-set a near-expired cached token
		cachedToken: "ghs_expired",
		expiresAt:   time.Now().Add(2 * time.Minute), // less than tokenRefreshMargin
	}

	// Should refresh because token is near expiry
	tok, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_token_1", tok)
	assert.Equal(t, 1, callCount)
}

func TestToken_HTTPError(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  pemBytes,
		httpClient:     server.Client(),
	}

	tok, err := provider.Token(context.Background())
	assert.Error(t, err)
	assert.Empty(t, tok)
	assert.Contains(t, err.Error(), "401")
}

func TestToken_EmptyTokenInResponse(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "",
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  pemBytes,
		httpClient:     server.Client(),
	}

	tok, err := provider.Token(context.Background())
	assert.Error(t, err)
	assert.Empty(t, tok)
	assert.Contains(t, err.Error(), "missing token field")
}

func TestToken_InvalidJSONResponse(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`not json at all`))
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  pemBytes,
		httpClient:     server.Client(),
	}

	tok, err := provider.Token(context.Background())
	assert.Error(t, err)
	assert.Empty(t, tok)
	assert.Contains(t, err.Error(), "decode installation token")
}

func TestToken_ContextCancellation(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(5 * time.Second)
		w.WriteHeader(http.StatusCreated)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  pemBytes,
		httpClient:     server.Client(),
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	tok, err := provider.Token(ctx)
	assert.Error(t, err)
	assert.Empty(t, tok)
}

// ─────────────────────────────────────────────────────────────────────
// Constants sanity checks
// ─────────────────────────────────────────────────────────────────────

func TestConstants(t *testing.T) {
	assert.Equal(t, "kubestellar-console-bot", DefaultConsoleAppSlug)
	assert.Equal(t, 9*time.Minute, appJWTLifetime)
	assert.Equal(t, 5*time.Minute, tokenRefreshMargin)
}

// ─────────────────────────────────────────────────────────────────────
// Env var names are correct
// ─────────────────────────────────────────────────────────────────────

func TestEnvVarNames(t *testing.T) {
	assert.Equal(t, "KUBESTELLAR_CONSOLE_APP_ID", appIDEnv)
	assert.Equal(t, "KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID", appInstallationIDEnv)
	assert.Equal(t, "KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY", appPrivateKeyEnv)
	assert.Equal(t, "KUBESTELLAR_CONSOLE_APP_SLUG", appSlugEnv)
}

// ─────────────────────────────────────────────────────────────────────
// Edge case: GITHUB_URL env var respected for API base
// ─────────────────────────────────────────────────────────────────────

func TestToken_CustomGitHubURL(t *testing.T) {
	_, pemBytes := getTestRSAKey(t)

	var receivedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "ghs_custom_url_token",
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	// Set GITHUB_URL to our test server (treated as GHE, gets /api/v3 appended)
	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "inst-42",
		privateKeyPEM:  pemBytes,
		httpClient:     server.Client(),
	}

	tok, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_custom_url_token", tok)
	// resolveGitHubAPIBase appends /api/v3 for non-github.com hosts
	assert.Equal(t, "/api/v3/app/installations/inst-42/access_tokens", receivedPath)
}
