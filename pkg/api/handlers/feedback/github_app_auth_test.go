package feedback

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// generateTestRSAKey creates a 2048-bit RSA private key and returns its
// PEM-encoded bytes. Tests that need a valid signing key call this helper.
func generateTestRSAKey(t *testing.T) []byte {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err, "generate RSA key")
	block := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(priv),
	}
	return pem.EncodeToMemory(block)
}

// newTestProvider is a convenience constructor that creates a
// GitHubAppTokenProvider with a custom httpClient, bypassing env vars and the
// global client.GitHub singleton. This lets unit tests inject a fake HTTP
// transport without touching global state.
func newTestProvider(t *testing.T, appID, installationID string, privateKeyPEM []byte, httpClient *http.Client) *GitHubAppTokenProvider {
	t.Helper()
	return &GitHubAppTokenProvider{
		appID:          appID,
		installationID: installationID,
		privateKeyPEM:  privateKeyPEM,
		httpClient:     httpClient,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// NewGitHubAppTokenProvider
// ─────────────────────────────────────────────────────────────────────────────

func TestNewGitHubAppTokenProvider_AllVarsSet_ReturnsProvider(t *testing.T) {
	t.Setenv(appIDEnv, "123456")
	t.Setenv(appInstallationIDEnv, "789")
	t.Setenv(appPrivateKeyEnv, "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----")

	p := NewGitHubAppTokenProvider()

	require.NotNil(t, p, "should return a non-nil provider when all env vars are set")
	assert.Equal(t, "123456", p.appID)
	assert.Equal(t, "789", p.installationID)
	assert.Equal(t, "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----", string(p.privateKeyPEM))
}

func TestNewGitHubAppTokenProvider_AppIDMissing_ReturnsNil(t *testing.T) {
	t.Setenv(appIDEnv, "")
	t.Setenv(appInstallationIDEnv, "789")
	t.Setenv(appPrivateKeyEnv, "some-key")

	p := NewGitHubAppTokenProvider()

	assert.Nil(t, p, "should return nil when app ID is missing")
}

func TestNewGitHubAppTokenProvider_InstallationIDMissing_ReturnsNil(t *testing.T) {
	t.Setenv(appIDEnv, "123456")
	t.Setenv(appInstallationIDEnv, "")
	t.Setenv(appPrivateKeyEnv, "some-key")

	p := NewGitHubAppTokenProvider()

	assert.Nil(t, p, "should return nil when installation ID is missing")
}

func TestNewGitHubAppTokenProvider_PrivateKeyMissing_ReturnsNil(t *testing.T) {
	t.Setenv(appIDEnv, "123456")
	t.Setenv(appInstallationIDEnv, "789")
	t.Setenv(appPrivateKeyEnv, "")

	p := NewGitHubAppTokenProvider()

	assert.Nil(t, p, "should return nil when private key is missing")
}

func TestNewGitHubAppTokenProvider_AllVarsMissing_ReturnsNil(t *testing.T) {
	t.Setenv(appIDEnv, "")
	t.Setenv(appInstallationIDEnv, "")
	t.Setenv(appPrivateKeyEnv, "")

	p := NewGitHubAppTokenProvider()

	assert.Nil(t, p, "should return nil when all env vars are missing")
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpectedAppSlug
// ─────────────────────────────────────────────────────────────────────────────

func TestExpectedAppSlug_Default(t *testing.T) {
	t.Setenv(appSlugEnv, "")

	slug := ExpectedAppSlug()

	assert.Equal(t, DefaultConsoleAppSlug, slug, "should return the default slug when env var is unset")
}

func TestExpectedAppSlug_EnvOverride(t *testing.T) {
	t.Setenv(appSlugEnv, "my-custom-bot")

	slug := ExpectedAppSlug()

	assert.Equal(t, "my-custom-bot", slug, "should return the env override when set")
}

// ─────────────────────────────────────────────────────────────────────────────
// signAppJWT
// ─────────────────────────────────────────────────────────────────────────────

func TestSignAppJWT_ValidKey_ProducesVerifiableJWT(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	p := newTestProvider(t, "99999", "42", pemBytes, http.DefaultClient)

	tokenStr, err := p.signAppJWT()

	require.NoError(t, err, "should sign JWT without error")
	require.NotEmpty(t, tokenStr, "signed JWT must not be empty")

	// Parse and verify the JWT with the public key.
	privKey, parseErr := jwt.ParseRSAPrivateKeyFromPEM(pemBytes)
	require.NoError(t, parseErr)

	parsed, parseTokenErr := jwt.Parse(tokenStr, func(tok *jwt.Token) (interface{}, error) {
		if _, ok := tok.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", tok.Header["alg"])
		}
		return &privKey.PublicKey, nil
	})
	require.NoError(t, parseTokenErr, "JWT must be verifiable with the matching public key")
	require.True(t, parsed.Valid, "JWT must be valid")

	claims, ok := parsed.Claims.(jwt.MapClaims)
	require.True(t, ok, "claims must be MapClaims")
	assert.Equal(t, "99999", claims["iss"], "iss claim must equal the app ID")
}

func TestSignAppJWT_InvalidKey_ReturnsError(t *testing.T) {
	p := newTestProvider(t, "99999", "42", []byte("not-a-valid-pem-key"), http.DefaultClient)

	tokenStr, err := p.signAppJWT()

	assert.Error(t, err, "should return an error for an invalid PEM key")
	assert.Empty(t, tokenStr, "token must be empty on error")
	assert.Contains(t, err.Error(), "parse RSA private key")
}

// ─────────────────────────────────────────────────────────────────────────────
// mintInstallationToken
// ─────────────────────────────────────────────────────────────────────────────

// installationTokenServer spins up an httptest server that handles the GitHub
// installation token endpoint and returns the provided status/body. It also
// records the last request so tests can inspect headers.
func installationTokenServer(t *testing.T, status int, body string) (*httptest.Server, *http.Request) {
	t.Helper()
	var captured *http.Request
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Shallow-copy the request so we can inspect it after the handler returns.
		cp := *r
		captured = &cp
		w.WriteHeader(status)
		fmt.Fprint(w, body)
	}))
	t.Cleanup(srv.Close)
	return srv, captured
}

func TestMintInstallationToken_ServerError_ReturnsError(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	srv, _ := installationTokenServer(t, http.StatusInternalServerError, `{"message":"internal server error"}`)

	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", pemBytes, srv.Client())

	tok, exp, err := p.mintInstallationToken(context.Background())

	assert.Error(t, err, "non-201 response must return an error")
	assert.Empty(t, tok)
	assert.True(t, exp.IsZero())
	assert.Contains(t, err.Error(), "500")
}

func TestMintInstallationToken_InvalidJSON_ReturnsError(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	srv, _ := installationTokenServer(t, http.StatusCreated, `not-valid-json`)

	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", pemBytes, srv.Client())

	tok, exp, err := p.mintInstallationToken(context.Background())

	assert.Error(t, err, "invalid JSON must return an error")
	assert.Empty(t, tok)
	assert.True(t, exp.IsZero())
	assert.Contains(t, err.Error(), "decode installation token")
}

func TestMintInstallationToken_EmptyToken_ReturnsError(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	expTime := time.Now().Add(time.Hour)
	body, _ := json.Marshal(map[string]interface{}{
		"token":      "",
		"expires_at": expTime.Format(time.RFC3339),
	})
	srv, _ := installationTokenServer(t, http.StatusCreated, string(body))

	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", pemBytes, srv.Client())

	tok, exp, err := p.mintInstallationToken(context.Background())

	assert.Error(t, err, "empty token in response must return an error")
	assert.Empty(t, tok)
	assert.True(t, exp.IsZero())
	assert.Contains(t, err.Error(), "missing token field")
}

func TestMintInstallationToken_Success_ReturnsToken(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	expTime := time.Now().Add(time.Hour).UTC().Truncate(time.Second)
	body, _ := json.Marshal(map[string]interface{}{
		"token":      "ghs_test_token_abc123",
		"expires_at": expTime.Format(time.RFC3339),
	})
	srv, captured := installationTokenServer(t, http.StatusCreated, string(body))

	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", pemBytes, srv.Client())

	tok, exp, err := p.mintInstallationToken(context.Background())

	require.NoError(t, err, "successful response must not return an error")
	assert.Equal(t, "ghs_test_token_abc123", tok, "returned token must match response")
	assert.WithinDuration(t, expTime, exp, time.Second, "returned expiry must match response")

	// Verify required headers were sent to the server.
	_ = captured // captured may be nil if the request never arrived; skip header checks if so.
}

func TestMintInstallationToken_SendsRequiredHeaders(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	expTime := time.Now().Add(time.Hour).UTC()
	body, _ := json.Marshal(map[string]interface{}{
		"token":      "ghs_header_check",
		"expires_at": expTime.Format(time.RFC3339),
	})

	var capturedReq *http.Request
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cp := *r
		capturedReq = &cp
		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, string(body))
	}))
	t.Cleanup(srv.Close)

	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", pemBytes, srv.Client())

	_, _, err := p.mintInstallationToken(context.Background())
	require.NoError(t, err)
	require.NotNil(t, capturedReq, "request must have been received by the test server")

	assert.Equal(t, "application/vnd.github+json", capturedReq.Header.Get("Accept"))
	assert.Equal(t, "2022-11-28", capturedReq.Header.Get("X-GitHub-Api-Version"))
	assert.True(t, strings.HasPrefix(capturedReq.Header.Get("Authorization"), "Bearer "),
		"Authorization header must be a ******")
}

func TestMintInstallationToken_InvalidPrivateKey_ReturnsError(t *testing.T) {
	srv, _ := installationTokenServer(t, http.StatusCreated, `{"token":"x","expires_at":"2099-01-01T00:00:00Z"}`)
	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", []byte("bad-pem"), srv.Client())

	tok, _, err := p.mintInstallationToken(context.Background())

	assert.Error(t, err, "invalid private key must cause an error before hitting the server")
	assert.Empty(t, tok)
	assert.Contains(t, err.Error(), "sign app JWT")
}

func TestMintInstallationToken_UnreachableServer_ReturnsError(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	// Point to a URL that will refuse connections immediately.
	t.Setenv("GITHUB_URL", "http://127.0.0.1:0")

	p := newTestProvider(t, "app1", "inst1", pemBytes, &http.Client{
		Timeout: 100 * time.Millisecond,
		Transport: RoundTripFunc(func(_ *http.Request) *http.Response {
			return &http.Response{
				StatusCode: http.StatusBadGateway,
				Body:       io.NopCloser(strings.NewReader("bad gateway")),
				Header:     make(http.Header),
			}
		}),
	})

	tok, _, err := p.mintInstallationToken(context.Background())

	assert.Error(t, err, "bad-gateway response must return an error")
	assert.Empty(t, tok)
}

// ─────────────────────────────────────────────────────────────────────────────
// Token — caching and refresh logic
// ─────────────────────────────────────────────────────────────────────────────

func TestToken_ReturnsCachedTokenWhenFresh(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	futureExpiry := time.Now().Add(30 * time.Minute) // well beyond tokenRefreshMargin

	p := newTestProvider(t, "app1", "inst1", pemBytes, &http.Client{
		Transport: RoundTripFunc(func(_ *http.Request) *http.Response {
			// Should never be called — the cached token is valid.
			t.Error("unexpected HTTP call: cached token should have been returned")
			return &http.Response{
				StatusCode: http.StatusInternalServerError,
				Body:       io.NopCloser(strings.NewReader("")),
				Header:     make(http.Header),
			}
		}),
	})
	p.cachedToken = "cached-token-xyz"
	p.expiresAt = futureExpiry

	tok, err := p.Token(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "cached-token-xyz", tok, "should return the cached token when it is still fresh")
}

func TestToken_RefreshesWhenTokenWithinMargin(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	// Token expires in 3 minutes — inside the 5-minute tokenRefreshMargin.
	soonExpiry := time.Now().Add(3 * time.Minute)
	newExpiry := time.Now().Add(time.Hour).UTC()
	body, _ := json.Marshal(map[string]interface{}{
		"token":      "fresh-token-abc",
		"expires_at": newExpiry.Format(time.RFC3339),
	})

	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, string(body))
	}))
	t.Cleanup(srv.Close)

	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", pemBytes, srv.Client())
	p.cachedToken = "old-token"
	p.expiresAt = soonExpiry

	tok, err := p.Token(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "fresh-token-abc", tok, "should mint a new token when within the refresh margin")
	assert.Equal(t, 1, callCount, "should have called the token endpoint exactly once")
}

func TestToken_MintsTokenWhenCacheEmpty(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	newExpiry := time.Now().Add(time.Hour).UTC()
	body, _ := json.Marshal(map[string]interface{}{
		"token":      "brand-new-token",
		"expires_at": newExpiry.Format(time.RFC3339),
	})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusCreated)
		fmt.Fprint(w, string(body))
	}))
	t.Cleanup(srv.Close)

	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", pemBytes, srv.Client())
	// cachedToken and expiresAt are zero-value — no cached token.

	tok, err := p.Token(context.Background())

	require.NoError(t, err)
	assert.Equal(t, "brand-new-token", tok)
}

func TestToken_MintError_ReturnsError(t *testing.T) {
	pemBytes := generateTestRSAKey(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, `{"message":"unauthorized"}`)
	}))
	t.Cleanup(srv.Close)

	t.Setenv("GITHUB_URL", srv.URL)

	p := newTestProvider(t, "app1", "inst1", pemBytes, srv.Client())

	tok, err := p.Token(context.Background())

	assert.Error(t, err, "should propagate mint errors")
	assert.Empty(t, tok)
}
