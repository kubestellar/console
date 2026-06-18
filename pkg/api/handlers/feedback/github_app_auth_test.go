package feedback

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// generateTestPrivateKey creates an RSA private key for testing
func generateTestPrivateKey(t *testing.T) string {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	keyBytes := x509.MarshalPKCS1PrivateKey(key)
	pemBlock := &pem.Block{
		Type:  "RSA PRIVATE KEY",
		Bytes: keyBytes,
	}
	return string(pem.EncodeToMemory(pemBlock))
}

func TestNewGitHubAppTokenProvider(t *testing.T) {
	tests := []struct {
		name           string
		appID          string
		installationID string
		privateKey     string
		expectedNil    bool
		description    string
	}{
		{
			name:           "all credentials present",
			appID:          "123456",
			installationID: "789012",
			privateKey:     "fake-key",
			expectedNil:    false,
			description:    "should create provider when all env vars are set",
		},
		{
			name:           "missing app ID",
			appID:          "",
			installationID: "789012",
			privateKey:     "fake-key",
			expectedNil:    true,
			description:    "should return nil when app ID is missing",
		},
		{
			name:           "missing installation ID",
			appID:          "123456",
			installationID: "",
			privateKey:     "fake-key",
			expectedNil:    true,
			description:    "should return nil when installation ID is missing",
		},
		{
			name:           "missing private key",
			appID:          "123456",
			installationID: "789012",
			privateKey:     "",
			expectedNil:    true,
			description:    "should return nil when private key is missing",
		},
		{
			name:           "all credentials missing",
			appID:          "",
			installationID: "",
			privateKey:     "",
			expectedNil:    true,
			description:    "should return nil when all credentials are missing",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Save and restore env vars
			origAppID := os.Getenv(appIDEnv)
			origInstallID := os.Getenv(appInstallationIDEnv)
			origPrivKey := os.Getenv(appPrivateKeyEnv)
			defer func() {
				os.Setenv(appIDEnv, origAppID)
				os.Setenv(appInstallationIDEnv, origInstallID)
				os.Setenv(appPrivateKeyEnv, origPrivKey)
			}()

			// Set test env vars
			os.Setenv(appIDEnv, tt.appID)
			os.Setenv(appInstallationIDEnv, tt.installationID)
			os.Setenv(appPrivateKeyEnv, tt.privateKey)

			provider := NewGitHubAppTokenProvider()

			if tt.expectedNil {
				assert.Nil(t, provider, tt.description)
			} else {
				require.NotNil(t, provider, tt.description)
				assert.Equal(t, tt.appID, provider.appID)
				assert.Equal(t, tt.installationID, provider.installationID)
				assert.Equal(t, []byte(tt.privateKey), provider.privateKeyPEM)
			}
		})
	}
}

func TestGitHubAppTokenProvider_signAppJWT(t *testing.T) {
	tests := []struct {
		name          string
		privateKeyPEM string
		appID         string
		expectError   bool
		description   string
	}{
		{
			name:          "valid private key",
			privateKeyPEM: "", // will be generated
			appID:         "123456",
			expectError:   false,
			description:   "should sign JWT with valid private key",
		},
		{
			name:          "invalid private key",
			privateKeyPEM: "not-a-valid-pem",
			appID:         "123456",
			expectError:   true,
			description:   "should return error for invalid private key",
		},
		{
			name:          "empty private key",
			privateKeyPEM: "",
			appID:         "123456",
			expectError:   true,
			description:   "should return error for empty private key",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			privateKey := tt.privateKeyPEM
			if privateKey == "" && !tt.expectError {
				privateKey = generateTestPrivateKey(t)
			}

			provider := &GitHubAppTokenProvider{
				appID:          tt.appID,
				installationID: "789012",
				privateKeyPEM:  []byte(privateKey),
			}

			token, err := provider.signAppJWT()

			if tt.expectError {
				assert.Error(t, err, tt.description)
				assert.Empty(t, token)
			} else {
				require.NoError(t, err, tt.description)
				assert.NotEmpty(t, token)

				// Verify the token structure
				parts := strings.Split(token, ".")
				assert.Len(t, parts, 3, "JWT should have 3 parts")

				// Parse and verify claims
				parsedToken, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
					// Decode the PEM key for verification
					block, _ := pem.Decode([]byte(privateKey))
					require.NotNil(t, block)
					key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
					require.NoError(t, err)
					return &key.PublicKey, nil
				})
				require.NoError(t, err)
				require.True(t, parsedToken.Valid)

				claims, ok := parsedToken.Claims.(jwt.MapClaims)
				require.True(t, ok)
				assert.Equal(t, tt.appID, claims["iss"])
				assert.NotNil(t, claims["iat"])
				assert.NotNil(t, claims["exp"])

				// Verify expiry is ~9 minutes from now
				exp := int64(claims["exp"].(float64))
				now := time.Now().Unix()
				expDiff := exp - now
				assert.Greater(t, expDiff, int64(8*60), "exp should be at least 8 min")
				assert.Less(t, expDiff, int64(10*60), "exp should be less than 10 min")
			}
		})
	}
}

func TestGitHubAppTokenProvider_mintInstallationToken(t *testing.T) {
	privateKey := generateTestPrivateKey(t)

	tests := []struct {
		name           string
		httpStatusCode int
		httpResponse   interface{}
		expectError    bool
		description    string
	}{
		{
			name:           "successful token exchange",
			httpStatusCode: http.StatusCreated,
			httpResponse: map[string]interface{}{
				"token":      "ghs_test_token",
				"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
			},
			expectError: false,
			description: "should mint installation token on success",
		},
		{
			name:           "GitHub API error",
			httpStatusCode: http.StatusUnauthorized,
			httpResponse:   map[string]interface{}{"message": "Unauthorized"},
			expectError:    true,
			description:    "should return error on HTTP 401",
		},
		{
			name:           "GitHub API server error",
			httpStatusCode: http.StatusInternalServerError,
			httpResponse:   map[string]interface{}{"message": "Internal Server Error"},
			expectError:    true,
			description:    "should return error on HTTP 500",
		},
		{
			name:           "missing token in response",
			httpStatusCode: http.StatusCreated,
			httpResponse: map[string]interface{}{
				"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
			},
			expectError: true,
			description: "should return error when token field is missing",
		},
		{
			name:           "invalid JSON response",
			httpStatusCode: http.StatusCreated,
			httpResponse:   "not-json",
			expectError:    true,
			description:    "should return error on invalid JSON",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Create mock HTTP client
			mockClient := &http.Client{
				Transport: RoundTripFunc(func(req *http.Request) *http.Response {
					// Verify request headers
					assert.Equal(t, "application/vnd.github+json", req.Header.Get("Accept"))
					assert.Equal(t, "2022-11-28", req.Header.Get("X-GitHub-Api-Version"))
					assert.Contains(t, req.Header.Get("Authorization"), "Bearer ")

					var body []byte
					if str, ok := tt.httpResponse.(string); ok {
						body = []byte(str)
					} else {
						body, _ = json.Marshal(tt.httpResponse)
					}

					return &http.Response{
						StatusCode: tt.httpStatusCode,
						Body:       io.NopCloser(bytes.NewReader(body)),
						Header:     make(http.Header),
					}
				}),
			}

			provider := &GitHubAppTokenProvider{
				appID:          "123456",
				installationID: "789012",
				privateKeyPEM:  []byte(privateKey),
				httpClient:     mockClient,
			}

			token, expiresAt, err := provider.mintInstallationToken(context.Background())

			if tt.expectError {
				assert.Error(t, err, tt.description)
				assert.Empty(t, token)
			} else {
				require.NoError(t, err, tt.description)
				assert.Equal(t, "ghs_test_token", token)
				assert.False(t, expiresAt.IsZero())
			}
		})
	}
}

func TestGitHubAppTokenProvider_Token_Caching(t *testing.T) {
	privateKey := generateTestPrivateKey(t)
	requestCount := 0

	mockClient := &http.Client{
		Transport: RoundTripFunc(func(req *http.Request) *http.Response {
			requestCount++
			body, _ := json.Marshal(map[string]interface{}{
				"token":      "ghs_cached_token",
				"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
			})
			return &http.Response{
				StatusCode: http.StatusCreated,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}
		}),
	}

	provider := &GitHubAppTokenProvider{
		appID:          "123456",
		installationID: "789012",
		privateKeyPEM:  []byte(privateKey),
		httpClient:     mockClient,
	}

	// First call should mint a new token
	token1, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_cached_token", token1)
	assert.Equal(t, 1, requestCount, "should make one request")

	// Second call should use cached token
	token2, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_cached_token", token2)
	assert.Equal(t, 1, requestCount, "should not make another request")

	// Verify tokens are the same
	assert.Equal(t, token1, token2)
}

func TestGitHubAppTokenProvider_Token_RefreshBeforeExpiry(t *testing.T) {
	privateKey := generateTestPrivateKey(t)

	mockClient := &http.Client{
		Transport: RoundTripFunc(func(req *http.Request) *http.Response {
			body, _ := json.Marshal(map[string]interface{}{
				"token":      "ghs_refreshed_token",
				"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
			})
			return &http.Response{
				StatusCode: http.StatusCreated,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}
		}),
	}

	provider := &GitHubAppTokenProvider{
		appID:          "123456",
		installationID: "789012",
		privateKeyPEM:  []byte(privateKey),
		httpClient:     mockClient,
		// Set cached token with expiry in 4 minutes (less than tokenRefreshMargin of 5 min)
		cachedToken: "ghs_old_token",
		expiresAt:   time.Now().Add(4 * time.Minute),
	}

	// Should refresh because expiry is within tokenRefreshMargin
	token, err := provider.Token(context.Background())
	require.NoError(t, err)
	assert.Equal(t, "ghs_refreshed_token", token, "should refresh token")
}

func TestGitHubAppTokenProvider_Token_ErrorHandling(t *testing.T) {
	privateKey := generateTestPrivateKey(t)

	mockClient := &http.Client{
		Transport: RoundTripFunc(func(req *http.Request) *http.Response {
			body, _ := json.Marshal(map[string]interface{}{
				"message": "Not Found",
			})
			return &http.Response{
				StatusCode: http.StatusNotFound,
				Body:       io.NopCloser(bytes.NewReader(body)),
				Header:     make(http.Header),
			}
		}),
	}

	provider := &GitHubAppTokenProvider{
		appID:          "123456",
		installationID: "789012",
		privateKeyPEM:  []byte(privateKey),
		httpClient:     mockClient,
	}

	token, err := provider.Token(context.Background())
	assert.Error(t, err, "should return error on API failure")
	assert.Empty(t, token)
	assert.Contains(t, err.Error(), "404", "error should include status code")
}

func TestExpectedAppSlug(t *testing.T) {
	tests := []struct {
		name         string
		envValue     string
		expectedSlug string
		description  string
	}{
		{
			name:         "default slug",
			envValue:     "",
			expectedSlug: DefaultConsoleAppSlug,
			description:  "should return default slug when env var is not set",
		},
		{
			name:         "custom slug",
			envValue:     "custom-app-slug",
			expectedSlug: "custom-app-slug",
			description:  "should return custom slug when env var is set",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			origSlug := os.Getenv(appSlugEnv)
			defer os.Setenv(appSlugEnv, origSlug)

			os.Setenv(appSlugEnv, tt.envValue)

			slug := ExpectedAppSlug()
			assert.Equal(t, tt.expectedSlug, slug, tt.description)
		})
	}
}

func TestGitHubAppTokenProvider_JWTClockSkew(t *testing.T) {
	privateKey := generateTestPrivateKey(t)

	provider := &GitHubAppTokenProvider{
		appID:          "123456",
		installationID: "789012",
		privateKeyPEM:  []byte(privateKey),
	}

	token, err := provider.signAppJWT()
	require.NoError(t, err)

	// Parse the token to check iat claim
	parsedToken, err := jwt.Parse(token, func(token *jwt.Token) (interface{}, error) {
		block, _ := pem.Decode([]byte(privateKey))
		require.NotNil(t, block)
		key, err := x509.ParsePKCS1PrivateKey(block.Bytes)
		require.NoError(t, err)
		return &key.PublicKey, nil
	})
	require.NoError(t, err)

	claims, ok := parsedToken.Claims.(jwt.MapClaims)
	require.True(t, ok)

	iat := int64(claims["iat"].(float64))
	now := time.Now().Unix()

	// iat should be ~60 seconds in the past to tolerate clock skew
	iatDiff := now - iat
	assert.Greater(t, iatDiff, int64(50), "iat should be at least 50 sec in the past")
	assert.Less(t, iatDiff, int64(70), "iat should be less than 70 sec in the past")
}
