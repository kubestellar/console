package feedback

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// generateTestRSAKey creates a PEM-encoded RSA private key for testing.
func generateTestRSAKey(t *testing.T) []byte {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	der := x509.MarshalPKCS1PrivateKey(key)
	block := &pem.Block{Type: "RSA PRIVATE KEY", Bytes: der}
	return pem.EncodeToMemory(block)
}

func TestNewGitHubAppTokenProvider_AllVarsSet(t *testing.T) {
	keyPEM := generateTestRSAKey(t)
	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, string(keyPEM))

	provider := NewGitHubAppTokenProvider()
	require.NotNil(t, provider, "provider should be created when all env vars are set")
	assert.Equal(t, "12345", provider.appID)
	assert.Equal(t, "67890", provider.installationID)
	assert.Equal(t, keyPEM, provider.privateKeyPEM)
}

func TestNewGitHubAppTokenProvider_MissingAppID(t *testing.T) {
	keyPEM := generateTestRSAKey(t)
	t.Setenv(appIDEnv, "")
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, string(keyPEM))

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when app ID is missing")
}

func TestNewGitHubAppTokenProvider_MissingInstallationID(t *testing.T) {
	keyPEM := generateTestRSAKey(t)
	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "")
	t.Setenv(appPrivateKeyEnv, string(keyPEM))

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when installation ID is missing")
}

func TestNewGitHubAppTokenProvider_MissingPrivateKey(t *testing.T) {
	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, "")

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when private key is missing")
}

func TestExpectedAppSlug_Default(t *testing.T) {
	t.Setenv(appSlugEnv, "")
	assert.Equal(t, DefaultConsoleAppSlug, ExpectedAppSlug())
}

func TestExpectedAppSlug_Override(t *testing.T) {
	t.Setenv(appSlugEnv, "my-custom-app")
	assert.Equal(t, "my-custom-app", ExpectedAppSlug())
}

func TestSignAppJWT_ValidSignature(t *testing.T) {
	keyPEM := generateTestRSAKey(t)
	provider := &GitHubAppTokenProvider{
		appID:         "12345",
		privateKeyPEM: keyPEM,
	}

	tokenStr, err := provider.signAppJWT()
	require.NoError(t, err)
	require.NotEmpty(t, tokenStr)

	// Parse the JWT to verify claims
	key, err := jwt.ParseRSAPrivateKeyFromPEM(keyPEM)
	require.NoError(t, err)

	parsed, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		return &key.PublicKey, nil
	})
	require.NoError(t, err)
	require.True(t, parsed.Valid)

	claims, ok := parsed.Claims.(jwt.MapClaims)
	require.True(t, ok)
	assert.Equal(t, "12345", claims["iss"])

	// iat should be ~60s in the past
	iat, _ := claims["iat"].(float64)
	assert.InDelta(t, time.Now().Add(-60*time.Second).Unix(), iat, 5)

	// exp should be ~9 minutes from now
	exp, _ := claims["exp"].(float64)
	assert.InDelta(t, time.Now().Add(appJWTLifetime).Unix(), exp, 5)
}

func TestSignAppJWT_InvalidKey(t *testing.T) {
	provider := &GitHubAppTokenProvider{
		appID:         "12345",
		privateKeyPEM: []byte("not a valid PEM key"),
	}

	_, err := provider.signAppJWT()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse RSA private key")
}

func TestToken_CachesResult(t *testing.T) {
	keyPEM := generateTestRSAKey(t)

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "ghs_test_installation_token",
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient:     server.Client(),
	}

	// First call — should hit the server
	tok1, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_test_installation_token", tok1)
	assert.Equal(t, 1, callCount)

	// Second call — should use cache
	tok2, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_test_installation_token", tok2)
	assert.Equal(t, 1, callCount, "second call should use cached token")
}

func TestToken_RefreshesExpiredToken(t *testing.T) {
	keyPEM := generateTestRSAKey(t)

	callCount := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "ghs_fresh_token",
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient:     server.Client(),
		// Pre-load an expired cached token
		cachedToken: "ghs_expired_token",
		expiresAt:   time.Now().Add(2 * time.Minute), // within tokenRefreshMargin
	}

	tok, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_fresh_token", tok)
	assert.Equal(t, 1, callCount, "should refresh expired token")
}

func TestMintInstallationToken_ServerError(t *testing.T) {
	keyPEM := generateTestRSAKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient:     server.Client(),
	}

	_, err := provider.Token(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
	assert.Contains(t, err.Error(), "Bad credentials")
}

func TestMintInstallationToken_EmptyTokenField(t *testing.T) {
	keyPEM := generateTestRSAKey(t)

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
		privateKeyPEM:  keyPEM,
		httpClient:     server.Client(),
	}

	_, err := provider.Token(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing token field")
}

func TestMintInstallationToken_InvalidJSON(t *testing.T) {
	keyPEM := generateTestRSAKey(t)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		w.Write([]byte(`not json`))
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient:     server.Client(),
	}

	_, err := provider.Token(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode installation token")
}

func TestMintInstallationToken_VerifiesAuthHeader(t *testing.T) {
	keyPEM := generateTestRSAKey(t)

	var receivedAuth string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "ghs_verified",
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient:     server.Client(),
	}

	_, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.True(t, len(receivedAuth) > len("Bearer "), "should send Bearer JWT in Authorization header")
	assert.Contains(t, receivedAuth, "Bearer ey", "JWT should start with ey")
}

func TestMintInstallationToken_CorrectURL(t *testing.T) {
	keyPEM := generateTestRSAKey(t)

	var receivedPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedPath = r.URL.Path
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "ghs_url_test",
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "99999",
		privateKeyPEM:  keyPEM,
		httpClient:     server.Client(),
	}

	_, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "/api/v3/app/installations/99999/access_tokens", receivedPath)
}
