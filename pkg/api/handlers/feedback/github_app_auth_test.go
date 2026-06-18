package feedback

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"io"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	testAppID          = "123456"
	testInstallationID = "78901234"
)

func generateTestKey(t *testing.T) ([]byte, *rsa.PrivateKey) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	privateKeyPEM := pem.EncodeToMemory(&pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(privateKey),
	})
	return privateKeyPEM, privateKey
}

func TestNewGitHubAppTokenProvider_AllVarsSet(t *testing.T) {
	pemBytes, _ := generateTestKey(t)
	t.Setenv(appIDEnv, testAppID)
	t.Setenv(appInstallationIDEnv, testInstallationID)
	t.Setenv(appPrivateKeyEnv, string(pemBytes))

	provider := NewGitHubAppTokenProvider()
	assert.NotNil(t, provider)
	assert.Equal(t, testAppID, provider.appID)
	assert.Equal(t, testInstallationID, provider.installationID)
	assert.Equal(t, pemBytes, provider.privateKeyPEM)
}

func TestNewGitHubAppTokenProvider_AppIDMissing(t *testing.T) {
	pemBytes, _ := generateTestKey(t)
	t.Setenv(appInstallationIDEnv, testInstallationID)
	t.Setenv(appPrivateKeyEnv, string(pemBytes))

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when app ID is missing")
}

func TestNewGitHubAppTokenProvider_InstallationIDMissing(t *testing.T) {
	pemBytes, _ := generateTestKey(t)
	t.Setenv(appIDEnv, testAppID)
	t.Setenv(appPrivateKeyEnv, string(pemBytes))

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when installation ID is missing")
}

func TestNewGitHubAppTokenProvider_PrivateKeyMissing(t *testing.T) {
	t.Setenv(appIDEnv, testAppID)
	t.Setenv(appInstallationIDEnv, testInstallationID)

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when private key is missing")
}

func TestExpectedAppSlug_Default(t *testing.T) {
	slug := ExpectedAppSlug()
	assert.Equal(t, DefaultConsoleAppSlug, slug)
}

func TestExpectedAppSlug_EnvOverride(t *testing.T) {
	t.Setenv(appSlugEnv, "my-custom-app")
	slug := ExpectedAppSlug()
	assert.Equal(t, "my-custom-app", slug)
}

func TestSignAppJWT_ValidSignature(t *testing.T) {
	pemBytes, privateKey := generateTestKey(t)

	provider := &GitHubAppTokenProvider{
		appID:         testAppID,
		privateKeyPEM: pemBytes,
	}

	jwtToken, err := provider.signAppJWT()
	require.NoError(t, err)
	assert.NotEmpty(t, jwtToken)

	token, err := jwt.Parse(jwtToken, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			t.Fatalf("unexpected signing method: %v", token.Header["alg"])
		}
		return &privateKey.PublicKey, nil
	})
	require.NoError(t, err)
	assert.True(t, token.Valid)

	claims, ok := token.Claims.(jwt.MapClaims)
	require.True(t, ok)
	assert.Equal(t, testAppID, claims["iss"])

	iat, ok := claims["iat"].(float64)
	require.True(t, ok)
	assert.Less(t, iat, float64(time.Now().Unix()))

	exp, ok := claims["exp"].(float64)
	require.True(t, ok)
	assert.Greater(t, exp, float64(time.Now().Unix()))
}

func TestSignAppJWT_InvalidKey(t *testing.T) {
	provider := &GitHubAppTokenProvider{
		appID:         testAppID,
		privateKeyPEM: []byte("not-a-valid-pem-key"),
	}

	jwtToken, err := provider.signAppJWT()
	assert.Error(t, err)
	assert.Empty(t, jwtToken)
	assert.Contains(t, err.Error(), "parse RSA private key")
}

func TestToken_Caching(t *testing.T) {
	pemBytes, _ := generateTestKey(t)
	expiresAt := time.Now().Add(60 * time.Minute)
	callCount := 0

	provider := &GitHubAppTokenProvider{
		appID:          testAppID,
		installationID: testInstallationID,
		privateKeyPEM:  pemBytes,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				callCount++
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body: io.NopCloser(bytes.NewBufferString(
						`{"token":"test-token","expires_at":"` + expiresAt.Format(time.RFC3339) + `"}`)),
					Header: make(http.Header),
				}
			}),
		},
	}

	ctx := context.Background()
	token1, err := provider.Token(ctx)
	require.NoError(t, err)
	assert.Equal(t, "test-token", token1)
	assert.Equal(t, 1, callCount)

	token2, err := provider.Token(ctx)
	require.NoError(t, err)
	assert.Equal(t, "test-token", token2)
	assert.Equal(t, 1, callCount, "should not make another API call")
}

func TestToken_RefreshBeforeExpiry(t *testing.T) {
	pemBytes, _ := generateTestKey(t)
	nearExpiry := time.Now().Add(4 * time.Minute)
	callCount := 0

	provider := &GitHubAppTokenProvider{
		appID:          testAppID,
		installationID: testInstallationID,
		privateKeyPEM:  pemBytes,
		cachedToken:    "old-token",
		expiresAt:      nearExpiry,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				callCount++
				newExpiry := time.Now().Add(60 * time.Minute)
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body: io.NopCloser(bytes.NewBufferString(
						`{"token":"new-token","expires_at":"` + newExpiry.Format(time.RFC3339) + `"}`)),
					Header: make(http.Header),
				}
			}),
		},
	}

	ctx := context.Background()
	token, err := provider.Token(ctx)
	require.NoError(t, err)
	assert.Equal(t, "new-token", token)
	assert.Equal(t, 1, callCount)
}

func TestMintInstallationToken_Success(t *testing.T) {
	pemBytes, _ := generateTestKey(t)
	expiresAt := time.Now().Add(60 * time.Minute)

	provider := &GitHubAppTokenProvider{
		appID:          testAppID,
		installationID: testInstallationID,
		privateKeyPEM:  pemBytes,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				assert.Contains(t, req.Header.Get("Authorization"), "Bearer ")
				assert.Equal(t, "application/vnd.github+json", req.Header.Get("Accept"))
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body: io.NopCloser(bytes.NewBufferString(
						`{"token":"inst-token","expires_at":"` + expiresAt.Format(time.RFC3339) + `"}`)),
					Header: make(http.Header),
				}
			}),
		},
	}

	ctx := context.Background()
	token, exp, err := provider.mintInstallationToken(ctx)
	require.NoError(t, err)
	assert.Equal(t, "inst-token", token)
	assert.False(t, exp.IsZero())
}

func TestMintInstallationToken_ServerError(t *testing.T) {
	pemBytes, _ := generateTestKey(t)

	provider := &GitHubAppTokenProvider{
		appID:          testAppID,
		installationID: testInstallationID,
		privateKeyPEM:  pemBytes,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusUnauthorized,
					Body:       io.NopCloser(bytes.NewBufferString(`{"message":"Bad credentials"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	ctx := context.Background()
	token, exp, err := provider.mintInstallationToken(ctx)
	assert.Error(t, err)
	assert.Empty(t, token)
	assert.True(t, exp.IsZero())
	assert.Contains(t, err.Error(), "401")
}

func TestMintInstallationToken_EmptyToken(t *testing.T) {
	pemBytes, _ := generateTestKey(t)
	expiresAt := time.Now().Add(60 * time.Minute)

	provider := &GitHubAppTokenProvider{
		appID:          testAppID,
		installationID: testInstallationID,
		privateKeyPEM:  pemBytes,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body: io.NopCloser(bytes.NewBufferString(
						`{"expires_at":"` + expiresAt.Format(time.RFC3339) + `"}`)),
					Header: make(http.Header),
				}
			}),
		},
	}

	ctx := context.Background()
	token, exp, err := provider.mintInstallationToken(ctx)
	assert.Error(t, err)
	assert.Empty(t, token)
	assert.True(t, exp.IsZero())
	assert.Contains(t, err.Error(), "missing token field")
}

func TestMintInstallationToken_InvalidJSON(t *testing.T) {
	pemBytes, _ := generateTestKey(t)

	provider := &GitHubAppTokenProvider{
		appID:          testAppID,
		installationID: testInstallationID,
		privateKeyPEM:  pemBytes,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(bytes.NewBufferString(`{not valid json}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	ctx := context.Background()
	token, exp, err := provider.mintInstallationToken(ctx)
	assert.Error(t, err)
	assert.Empty(t, token)
	assert.True(t, exp.IsZero())
	assert.Contains(t, err.Error(), "decode installation token")
}

func TestMintInstallationToken_ContextCancellation(t *testing.T) {
	pemBytes, _ := generateTestKey(t)

	provider := &GitHubAppTokenProvider{
		appID:          testAppID,
		installationID: testInstallationID,
		privateKeyPEM:  pemBytes,
		httpClient: &http.Client{
			Transport: RoundTripFunc(func(req *http.Request) *http.Response {
				time.Sleep(100 * time.Millisecond)
				return &http.Response{
					StatusCode: http.StatusCreated,
					Body:       io.NopCloser(bytes.NewBufferString(`{"token":"test"}`)),
					Header:     make(http.Header),
				}
			}),
		},
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, _, err := provider.mintInstallationToken(ctx)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "context canceled")
}

func TestNewGitHubAppTokenProvider_AllVarsMissing(t *testing.T) {
	os.Unsetenv(appIDEnv)
	os.Unsetenv(appInstallationIDEnv)
	os.Unsetenv(appPrivateKeyEnv)

	provider := NewGitHubAppTokenProvider()
	assert.Nil(t, provider, "provider should be nil when all credentials are missing")
}

func TestExpectedAppSlug_EmptyEnvVar(t *testing.T) {
	t.Setenv(appSlugEnv, "")
	slug := ExpectedAppSlug()
	assert.Equal(t, DefaultConsoleAppSlug, slug)
}

func TestResolveGitHubAPIBase_AppAuth(t *testing.T) {
	t.Setenv("GITHUB_URL", "https://ghe.example.com")
	base := resolveGitHubAPIBase()
	assert.Equal(t, "https://ghe.example.com/api/v3", base)

	t.Setenv("GITHUB_URL", "https://github.com")
	base = resolveGitHubAPIBase()
	assert.Equal(t, "https://api.github.com", base)
}
