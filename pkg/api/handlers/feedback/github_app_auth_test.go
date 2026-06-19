package feedback

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// errRoundTripFunc is a transport that can return both a response and an error,
// used to simulate network failures in tests.
type errRoundTripFunc func(*http.Request) (*http.Response, error)

func (f errRoundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

// generateTestRSAKeyPEM generates a PEM-encoded RSA private key for tests.
func generateTestRSAKeyPEM(t *testing.T) []byte {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	var buf bytes.Buffer
	err = pem.Encode(&buf, &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	})
	require.NoError(t, err)
	return buf.Bytes()
}

// --- NewGitHubAppTokenProvider tests ---

func TestNewGitHubAppTokenProvider_NilWhenAppIDMissing(t *testing.T) {
	t.Setenv(appIDEnv, "")
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, "some-key")

	p := NewGitHubAppTokenProvider()
	assert.Nil(t, p, "should return nil when app ID is not set")
}

func TestNewGitHubAppTokenProvider_NilWhenInstallationIDMissing(t *testing.T) {
	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "")
	t.Setenv(appPrivateKeyEnv, "some-key")

	p := NewGitHubAppTokenProvider()
	assert.Nil(t, p, "should return nil when installation ID is not set")
}

func TestNewGitHubAppTokenProvider_NilWhenPrivateKeyMissing(t *testing.T) {
	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, "")

	p := NewGitHubAppTokenProvider()
	assert.Nil(t, p, "should return nil when private key is not set")
}

func TestNewGitHubAppTokenProvider_NilWhenAllMissing(t *testing.T) {
	t.Setenv(appIDEnv, "")
	t.Setenv(appInstallationIDEnv, "")
	t.Setenv(appPrivateKeyEnv, "")

	p := NewGitHubAppTokenProvider()
	assert.Nil(t, p, "should return nil when all credentials are missing")
}

func TestNewGitHubAppTokenProvider_NonNilWhenAllSet(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)

	t.Setenv(appIDEnv, "12345")
	t.Setenv(appInstallationIDEnv, "67890")
	t.Setenv(appPrivateKeyEnv, string(keyPEM))

	p := NewGitHubAppTokenProvider()
	require.NotNil(t, p, "should return a provider when all credentials are set")
	assert.Equal(t, "12345", p.appID)
	assert.Equal(t, "67890", p.installationID)
	assert.Equal(t, keyPEM, p.privateKeyPEM)
}

// --- ExpectedAppSlug tests ---

func TestExpectedAppSlug_Default(t *testing.T) {
	t.Setenv(appSlugEnv, "")
	slug := ExpectedAppSlug()
	assert.Equal(t, DefaultConsoleAppSlug, slug, "should return default slug when env var is unset")
}

func TestExpectedAppSlug_FromEnv(t *testing.T) {
	t.Setenv(appSlugEnv, "my-custom-bot")
	slug := ExpectedAppSlug()
	assert.Equal(t, "my-custom-bot", slug, "should return env var value when set")
}

// --- Token caching tests ---

func TestToken_ReturnsCachedToken_WhenNotExpired(t *testing.T) {
	p := &GitHubAppTokenProvider{
		cachedToken: "cached-install-token",
		expiresAt:   time.Now().Add(30 * time.Minute), // well within valid window
	}

	tok, err := p.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "cached-install-token", tok, "should return cached token when not near expiry")
}

func TestToken_RefreshesWhenNearExpiry(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)
	freshToken := "fresh-install-token"
	expiry := time.Now().Add(60 * time.Minute)

	respBody, err := json.Marshal(map[string]interface{}{
		"token":      freshToken,
		"expires_at": expiry.Format(time.RFC3339),
	})
	require.NoError(t, err)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		cachedToken:    "old-token",
		expiresAt:      time.Now().Add(2 * time.Minute), // within tokenRefreshMargin → must refresh
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(bytes.NewReader(respBody)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	tok, err := p.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, freshToken, tok, "should return fresh token when near expiry")
	assert.Equal(t, freshToken, p.cachedToken, "should cache the new token")
}

func TestToken_RefreshesWhenCacheEmpty(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)
	freshToken := "new-install-token"
	expiry := time.Now().Add(60 * time.Minute)

	respBody, err := json.Marshal(map[string]interface{}{
		"token":      freshToken,
		"expires_at": expiry.Format(time.RFC3339),
	})
	require.NoError(t, err)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		cachedToken:    "",
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(bytes.NewReader(respBody)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	tok, err := p.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, freshToken, tok)
}

// --- mintInstallationToken tests ---

func TestMintInstallationToken_Success(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)
	expectedToken := "ghs_test_installation_token"
	expiry := time.Now().Add(60 * time.Minute)

	respBody, err := json.Marshal(map[string]interface{}{
		"token":      expectedToken,
		"expires_at": expiry.Format(time.RFC3339),
	})
	require.NoError(t, err)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				// Verify request shape
				assert.Equal(t, "POST", req.Method)
				assert.True(t, strings.HasSuffix(req.URL.Path, "/app/installations/67890/access_tokens"))
				assert.True(t, strings.HasPrefix(req.Header.Get("Authorization"), "Bearer "))
				assert.Equal(t, "application/vnd.github+json", req.Header.Get("Accept"))

				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(bytes.NewReader(respBody)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	tok, exp, err := p.mintInstallationToken(context.Background())
	require.NoError(t, err)
	assert.Equal(t, expectedToken, tok)
	assert.WithinDuration(t, expiry, exp, time.Second)
}

func TestMintInstallationToken_HTTPError(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient: &http.Client{
			Transport: errRoundTripFunc(func(req *http.Request) (*http.Response, error) {
				return nil, errors.New("connection refused")
			}),
		},
	}

	_, _, err := p.mintInstallationToken(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "installation token request")
}

func TestMintInstallationToken_Non201Status(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusUnauthorized,
					Body:       io.NopCloser(strings.NewReader(`{"message":"Bad credentials"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, _, err := p.mintInstallationToken(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "401")
	assert.Contains(t, err.Error(), "Bad credentials")
}

func TestMintInstallationToken_ForbiddenStatus(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "99999",
		privateKeyPEM:  keyPEM,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusForbidden,
					Body:       io.NopCloser(strings.NewReader(`{"message":"Resource not accessible by integration"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, _, err := p.mintInstallationToken(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "403")
}

func TestMintInstallationToken_EmptyTokenInResponse(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)

	respBody, err := json.Marshal(map[string]interface{}{
		"token":      "",
		"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
	})
	require.NoError(t, err)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(bytes.NewReader(respBody)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, _, err = p.mintInstallationToken(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing token field")
}

func TestMintInstallationToken_MalformedJSON(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(strings.NewReader(`not valid json`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	_, _, err := p.mintInstallationToken(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode installation token")
}

// --- signAppJWT tests ---

func TestSignAppJWT_InvalidPEMKey(t *testing.T) {
	p := &GitHubAppTokenProvider{
		appID:         "12345",
		privateKeyPEM: []byte("not a valid PEM key"),
	}

	_, err := p.signAppJWT()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse RSA private key")
}

func TestSignAppJWT_ValidKey_ProducesJWT(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)

	p := &GitHubAppTokenProvider{
		appID:         "12345",
		privateKeyPEM: keyPEM,
	}

	tok, err := p.signAppJWT()
	require.NoError(t, err)
	assert.NotEmpty(t, tok, "should produce a non-empty JWT token string")
	// JWT format: header.payload.signature
	parts := strings.Split(tok, ".")
	assert.Len(t, parts, 3, "JWT should have exactly three dot-separated parts")
}

func TestSignAppJWT_JWTContainsThreeParts(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)

	p := &GitHubAppTokenProvider{
		appID:         "app-id-99",
		privateKeyPEM: keyPEM,
	}

	tokStr, err := p.signAppJWT()
	require.NoError(t, err)

	// RS256 JWT format: header.payload.signature — exactly three dot-separated parts.
	parts := strings.Split(tokStr, ".")
	assert.Len(t, parts, 3, "JWT should consist of three dot-separated parts (header.payload.signature)")
}

// --- Token concurrent access test ---

func TestToken_ConcurrentAccess_NoPanic(t *testing.T) {
	keyPEM := generateTestRSAKeyPEM(t)
	expiry := time.Now().Add(60 * time.Minute)

	respBody, err := json.Marshal(map[string]interface{}{
		"token":      "concurrent-token",
		"expires_at": expiry.Format(time.RFC3339),
	})
	require.NoError(t, err)

	p := &GitHubAppTokenProvider{
		appID:          "12345",
		installationID: "67890",
		privateKeyPEM:  keyPEM,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(bytes.NewReader(respBody)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	// First call to populate cache
	_, err = p.Token(context.Background())
	require.NoError(t, err)

	// Now concurrently read the cached token — should not panic
	done := make(chan struct{}, 10)
	for i := 0; i < 10; i++ {
		go func() {
			defer func() { done <- struct{}{} }()
			tok, tokErr := p.Token(context.Background())
			assert.NoError(t, tokErr)
			assert.Equal(t, "concurrent-token", tok)
		}()
	}
	for i := 0; i < 10; i++ {
		<-done
	}
}
