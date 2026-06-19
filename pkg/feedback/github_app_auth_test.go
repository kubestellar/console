package feedback

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestNewGitHubAppTokenProvider_AllEnvVarsSet creates a provider when all
// required env vars are configured.
func TestNewGitHubAppTokenProvider_AllEnvVarsSet(t *testing.T) {
	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, testPrivateKeyPEM)

	provider := NewGitHubAppTokenProvider()
	require.NotNil(t, provider, "provider should not be nil when all env vars are set")
	assert.Equal(t, "12345", provider.appID)
	assert.Equal(t, "67890", provider.installationID)
	assert.Equal(t, []byte(testPrivateKeyPEM), provider.privateKeyPEM)
}

// TestNewGitHubAppTokenProvider_MissingAppID returns nil when app ID is missing.
func TestNewGitHubAppTokenProvider_MissingAppID(t *testing.T) {
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, testPrivateKeyPEM)

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when app ID is missing")
}

// TestNewGitHubAppTokenProvider_MissingInstallationID returns nil when
// installation ID is missing.
func TestNewGitHubAppTokenProvider_MissingInstallationID(t *testing.T) {
	t.Setenv(appIDEnv, "12345")
	t.Setenv(appPrivateKeyEnv, testPrivateKeyPEM)

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when installation ID is missing")
}

// TestNewGitHubAppTokenProvider_MissingPrivateKey returns nil when private
// key is missing.
func TestNewGitHubAppTokenProvider_MissingPrivateKey(t *testing.T) {
	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "67890")

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when private key is missing")
}

// TestNewGitHubAppTokenProvider_AllEnvVarsEmpty returns nil when all env vars
// are empty strings.
func TestNewGitHubAppTokenProvider_AllEnvVarsEmpty(t *testing.T) {
	t.Setenv(appIDEnv, "")
	t.Setenv(appInstallationIDEnv, "")
	t.Setenv(appPrivateKeyEnv, "")

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when all env vars are empty")
}

// TestExpectedAppSlug_CustomSlug reads custom slug from env var.
func TestExpectedAppSlug_CustomSlug(t *testing.T) {
	t.Setenv(appSlugEnv, "custom-app-slug")
	slug := ExpectedAppSlug()
	assert.Equal(t, "custom-app-slug", slug)
}

// TestExpectedAppSlug_DefaultSlug falls back to default when env var is not set.
func TestExpectedAppSlug_DefaultSlug(t *testing.T) {
	slug := ExpectedAppSlug()
	assert.Equal(t, DefaultConsoleAppSlug, slug)
}

// TestSignAppJWT_ValidJWT produces a valid JWT with correct claims.
func TestSignAppJWT_ValidJWT(t *testing.T) {
	provider := &GitHubAppTokenProvider{
		appID:         "12345",
		privateKeyPEM: []byte(testPrivateKeyPEM),
	}

	tokenString, err := provider.signAppJWT()
	require.NoError(t, err, "signing JWT should not fail with valid private key")

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		key, err := jwt.ParseRSAPublicKeyFromPEM([]byte(testPublicKeyPEM))
		require.NoError(t, err)
		return key, nil
	})
	require.NoError(t, err, "parsing JWT should not fail")
	require.True(t, token.Valid, "JWT should be valid")

	claims, ok := token.Claims.(jwt.MapClaims)
	require.True(t, ok, "claims should be MapClaims")
	assert.Equal(t, "12345", claims["iss"], "issuer should be app ID")

	iat, ok := claims["iat"].(float64)
	require.True(t, ok, "iat should be numeric")
	exp, ok := claims["exp"].(float64)
	require.True(t, ok, "exp should be numeric")

	now := time.Now().Unix()
	assert.True(t, iat < float64(now+60), "iat should be in the past or near future")
	assert.True(t, exp > float64(now), "exp should be in the future")
	assert.True(t, exp-iat > 500, "JWT should be valid for at least 8 minutes")
}

// TestSignAppJWT_InvalidPrivateKey returns error with invalid PEM.
func TestSignAppJWT_InvalidPrivateKey(t *testing.T) {
	provider := &GitHubAppTokenProvider{
		appID:         "12345",
		privateKeyPEM: []byte("not-a-valid-pem"),
	}

	_, err := provider.signAppJWT()
	assert.Error(t, err, "signing JWT should fail with invalid private key")
	assert.Contains(t, err.Error(), "parse RSA private key")
}

// TestMintInstallationToken_SuccessfulFlow mints a token when GitHub API
// returns 201 Created with a valid token.
func TestMintInstallationToken_SuccessfulFlow(t *testing.T) {
	expiresAt := time.Now().Add(60 * time.Minute)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "POST", r.Method)
		assert.Contains(t, r.URL.Path, "/app/installations/67890/access_tokens")
		assert.Contains(t, r.Header.Get("Authorization"), "Bearer ")
		assert.Equal(t, "application/vnd.github+json", r.Header.Get("Accept"))

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      "ghs_test_token",
			"expires_at": expiresAt.Format(time.RFC3339),
		})
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)
	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  []byte(testPrivateKeyPEM),
		httpClient:     &http.Client{Timeout: 10 * time.Second},
	}

	token, exp, err := provider.mintInstallationToken(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_test_token", token)
	assert.WithinDuration(t, expiresAt, exp, 2*time.Second)
}

// TestMintInstallationToken_Non201Response returns error when GitHub API
// returns non-201 status.
func TestMintInstallationToken_Non201Response(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message":"Bad credentials"}`))
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)
	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  []byte(testPrivateKeyPEM),
		httpClient:     &http.Client{Timeout: 10 * time.Second},
	}

	_, _, err := provider.mintInstallationToken(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
}

// TestMintInstallationToken_MissingTokenField returns error when response is
// missing the token field.
func TestMintInstallationToken_MissingTokenField(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		})
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)
	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  []byte(testPrivateKeyPEM),
		httpClient:     &http.Client{Timeout: 10 * time.Second},
	}

	_, _, err := provider.mintInstallationToken(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing token field")
}

// TestToken_CachesMintedToken calls Token twice and verifies the second call
// uses the cached token without hitting the API again.
func TestToken_CachesMintedToken(t *testing.T) {
	callCount := 0
	expiresAt := time.Now().Add(60 * time.Minute)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"token":      "ghs_cached_token",
			"expires_at": expiresAt.Format(time.RFC3339),
		})
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)
	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  []byte(testPrivateKeyPEM),
		httpClient:     &http.Client{Timeout: 10 * time.Second},
	}

	token1, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_cached_token", token1)
	assert.Equal(t, 1, callCount, "first call should hit the API")

	token2, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_cached_token", token2)
	assert.Equal(t, 1, callCount, "second call should use cache, not hit API")
}

// TestToken_RefreshesExpiredToken refreshes the token when it's within the
// refresh margin.
func TestToken_RefreshesExpiredToken(t *testing.T) {
	callCount := 0
	expiresAt := time.Now().Add(3 * time.Minute) // Within refresh margin
	newExpiresAt := time.Now().Add(60 * time.Minute)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		if callCount == 1 {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"token":      "ghs_expiring_token",
				"expires_at": expiresAt.Format(time.RFC3339),
			})
		} else {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"token":      "ghs_refreshed_token",
				"expires_at": newExpiresAt.Format(time.RFC3339),
			})
		}
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)
	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  []byte(testPrivateKeyPEM),
		httpClient:     &http.Client{Timeout: 10 * time.Second},
	}

	token1, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_expiring_token", token1)
	assert.Equal(t, 1, callCount)

	token2, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_refreshed_token", token2, "token should be refreshed")
	assert.Equal(t, 2, callCount, "should refresh token within margin")
}

// TestToken_ErrorOnMint returns error when minting fails.
func TestToken_ErrorOnMint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	t.Setenv("GITHUB_URL", server.URL)
	provider := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  []byte(testPrivateKeyPEM),
		httpClient:     &http.Client{Timeout: 10 * time.Second},
	}

	_, err := provider.Token(context.Background())
	assert.Error(t, err)
}

// testPrivateKeyPEM is a test RSA private key (2048-bit) for JWT signing.
// Do NOT use in production — this is a test-only key generated specifically
// for this test suite.
const testPrivateKeyPEM = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV6ffAt0rLH
NmZj8W0AKqKjC1xQQc4u77dXPR8D6EFDS8bHQr+L6wEChYKaO1J0vK1xh6H+kGBc
VGiFP2u1CLZR5t6LqmJCqZQF3f5pPu8aIjbgBpY+AYMcVFMVFNMKf9xTiHUNXuTg
M6hMnxBiMbS7FnHqmkfx/YqnVQP/ksqvU5rlxz4aL4HxlIslRi8ELSJqPbgzmNM3
qoSTNLKPmqPm7yH+s0sHH1ljZGYqNcBxo9jJB+VQ9RRp6RLjNJHmJF9FzwL5qT9c
VLsKgvP0phFqYSBPkXKdnAIL4bKY7jZLKBjbQQIDAQABAoIBAFj+yL8U8RuRpGTl
VyPqFh3bw5lFJKvJ6Y8s7HFPqcBfY8nAiUZG9qFu8BLyQH0GZ6C2FT3hFzNNbqzU
oTSyL1RH6xkRLN8KlHfwwUzVWGYPvH+X3z8uW8RfzhLhTq5rGWLGZHbCr3WZo1qy
dj0e+sQOVHgBPn8UZhKbWiVQJJL8oGvCZH2QCFXI7DNYTN5qYKkUx3+1tLfqwP7Y
cLVg5tQP6Hn6ZW3mjhL3e7hN8nLJzXQSYLTyTW1L3ydN3FPqGELh9qXbI8xvE4+M
SBBz2qV8QVFoVWQNGJ4PLEeUxN7bV+1WC/mJALvMJPbPZDqJqV3fGQ7OLpCUwTDC
qUPY4YECgYEA4sE3C4dOqT5gPOsUfG3vQC6fAT5hWGVh3zzXnBqKdBr3qDDbH8Hw
8dC7LSvUDzn7e7CbLqBCCYFwF6A8P3E0aS9FMp4L1RhGVJCHPqNqW/1gqH6Tg6q3
8d4N1LQBqWvGM0gXF1FRKY6v/CcjKHf2hCJLBR+fvP5U3RDxKcHUeKECgYEA0uEF
KYJ8GN2XMKCBfJ3q3fHGvP+YLG1dCKP2GcJQKSNKJ1b8L1LrVqH8q5YB5pS6tpwx
3YdgXsj+xL3pVhLqNDNTb/9oGUvGz8g9cFXYH8pKPH8A/y9O2cXxgPLDHFpQhBj4
G0YhEbRh0kMsZK8D2B3pCfLU4M9pJN8FMF5TP4ECgYEAj3wWoLQfDJN1ZZ7nZPqJ
MKMzMh0u1kfVPQD3nNiQrMqNJXYB7g1qG6YvP7T4zF8xYYLvN+KqFqPqPGq1QKFN
7VZ+8v3W7v3xYH6P7pDO0KQJZ9vvFJ0cU0vJGqU1HQxLGNfGhNr7+6U8HQV1m7V3
O3p8yLJlZ0VJJZV+l5GZ5oECgYB3fGJqN7MpPQFH7GGGRvONLMxRLqNpVqZfQN8h
lPcPO3M8sQKBgQC7vNXKVp3sKMhM0Qh3yVNqXQpL3qN5LKhXQH8P9F0L3z8QV9h1
q8dZW5fF8pzV9FqT8w7yVbLnKZY8h7N8M3LKqHzZP8NRpL7W7V3MQvNJ8j+8fV9P
-----END RSA PRIVATE KEY-----`

// testPublicKeyPEM is the corresponding public key for testPrivateKeyPEM.
const testPublicKeyPEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu1SU1LfVLPHCozMxH2Mo
4lgOEePzNm0tRgeLezV6ffAt0rLHNmZj8W0AKqKjC1xQQc4u77dXPR8D6EFDS8bH
Qr+L6wEChYKaO1J0vK1xh6H+kGBcVGiFP2u1CLZR5t6LqmJCqZQF3f5pPu8aIjbg
BpY+AYMcVFMVFNMKf9xTiHUNXuTgM6hMnxBiMbS7FnHqmkfx/YqnVQP/ksqvU5rl
xz4aL4HxlIslRi8ELSJqPbgzmNM3qoSTNLKPmqPm7yH+s0sHH1ljZGYqNcBxo9jJ
B+VQ9RRp6RLjNJHmJF9FzwL5qT9cVLsKgvP0phFqYSBPkXKdnAIL4bKY7jZLKBjb
QQIDAQAB
-----END PUBLIC KEY-----`

// fiberTestTimeout is the timeout for Fiber app test requests.
const fiberTestTimeout = 30 * time.Second
