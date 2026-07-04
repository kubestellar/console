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
	"os"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/require"
)

func TestNewGitHubAppTokenProvider(t *testing.T) {
	tests := []struct {
		name      string
		envVars   map[string]string
		expectNil bool
	}{
		{
			name: "all credentials present",
			envVars: map[string]string{
				"KUBESTELLAR_CONSOLE_APP_ID":              "123456",
				"KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID": "789012",
				"KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY":     generateTestPrivateKey(t),
			},
			expectNil: false,
		},
		{
			name: "missing app id",
			envVars: map[string]string{
				"KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID": "789012",
				"KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY":     generateTestPrivateKey(t),
			},
			expectNil: true,
		},
		{
			name: "missing installation id",
			envVars: map[string]string{
				"KUBESTELLAR_CONSOLE_APP_ID":          "123456",
				"KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY": generateTestPrivateKey(t),
			},
			expectNil: true,
		},
		{
			name: "missing private key",
			envVars: map[string]string{
				"KUBESTELLAR_CONSOLE_APP_ID":              "123456",
				"KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID": "789012",
			},
			expectNil: true,
		},
		{
			name:      "all credentials missing",
			envVars:   map[string]string{},
			expectNil: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Clear env vars before each test
			t.Setenv("KUBESTELLAR_CONSOLE_APP_ID", "")
			t.Setenv("KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID", "")
			t.Setenv("KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY", "")

			// Set test env vars
			for k, v := range tt.envVars {
				t.Setenv(k, v)
			}

			provider := NewGitHubAppTokenProvider()

			if tt.expectNil {
				require.Nil(t, provider)
			} else {
				require.NotNil(t, provider)
				require.Equal(t, "123456", provider.appID)
				require.Equal(t, "789012", provider.installationID)
			}
		})
	}
}

func TestGitHubAppTokenProvider_SignAppJWT(t *testing.T) {
	privateKeyPEM := generateTestPrivateKey(t)

	provider := &GitHubAppTokenProvider{
		appID:         "123456",
		privateKeyPEM: []byte(privateKeyPEM),
	}

	tokenString, err := provider.signAppJWT()
	require.NoError(t, err)
	require.NotEmpty(t, tokenString)

	// Parse token to verify structure
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// Verify signing method
		require.Equal(t, jwt.SigningMethodRS256, token.Method)
		// Parse the public key from the private key for verification
		key, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(privateKeyPEM))
		require.NoError(t, err)
		return &key.PublicKey, nil
	})
	require.NoError(t, err)
	require.True(t, token.Valid)

	// Verify claims
	claims, ok := token.Claims.(jwt.MapClaims)
	require.True(t, ok)
	require.Equal(t, "123456", claims["iss"])
	require.NotNil(t, claims["iat"])
	require.NotNil(t, claims["exp"])
}

func TestGitHubAppTokenProvider_Token(t *testing.T) {
	privateKeyPEM := generateTestPrivateKey(t)

	// Mock GitHub API server
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "POST", r.Method)
		require.Contains(t, r.URL.Path, "/app/installations/789012/access_tokens")
		require.Contains(t, r.Header.Get("Authorization"), "Bearer ")

		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "ghs_test_installation_token",
			"expires_at": time.Now().Add(60 * time.Minute).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	// Override GitHub API base for testing
	t.Setenv("GITHUB_URL", srv.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "123456",
		installationID: "789012",
		privateKeyPEM:  []byte(privateKeyPEM),
		httpClient:     &http.Client{Timeout: 5 * time.Second},
	}

	ctx := context.Background()
	token, err := provider.Token(ctx)
	require.NoError(t, err)
	require.Equal(t, "ghs_test_installation_token", token)

	// Second call should return cached token
	token2, err := provider.Token(ctx)
	require.NoError(t, err)
	require.Equal(t, token, token2)
}

func TestGitHubAppTokenProvider_Token_Refresh(t *testing.T) {
	privateKeyPEM := generateTestPrivateKey(t)

	callCount := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		callCount++
		w.WriteHeader(http.StatusCreated)
		resp := map[string]interface{}{
			"token":      "ghs_test_token_" + string(rune('0'+callCount)),
			"expires_at": time.Now().Add(1 * time.Second).Format(time.RFC3339),
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	t.Setenv("GITHUB_URL", srv.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "123456",
		installationID: "789012",
		privateKeyPEM:  []byte(privateKeyPEM),
		httpClient:     &http.Client{Timeout: 5 * time.Second},
	}

	ctx := context.Background()

	// First call
	token1, err := provider.Token(ctx)
	require.NoError(t, err)
	require.Equal(t, "ghs_test_token_1", token1)

	// Wait for token to be close to expiry (within refresh margin)
	time.Sleep(2 * time.Second)

	// Second call should refresh
	token2, err := provider.Token(ctx)
	require.NoError(t, err)
	require.Equal(t, "ghs_test_token_2", token2)
	require.NotEqual(t, token1, token2)
}

func TestGitHubAppTokenProvider_Token_APIError(t *testing.T) {
	privateKeyPEM := generateTestPrivateKey(t)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"message": "Invalid JWT"}`))
	}))
	defer srv.Close()

	t.Setenv("GITHUB_URL", srv.URL)

	provider := &GitHubAppTokenProvider{
		appID:          "123456",
		installationID: "789012",
		privateKeyPEM:  []byte(privateKeyPEM),
		httpClient:     &http.Client{Timeout: 5 * time.Second},
	}

	ctx := context.Background()
	_, err := provider.Token(ctx)
	require.Error(t, err)
	require.Contains(t, err.Error(), "401")
}

func TestExpectedAppSlug(t *testing.T) {
	tests := []struct {
		name     string
		envValue string
		expected string
	}{
		{
			name:     "default slug",
			envValue: "",
			expected: DefaultConsoleAppSlug,
		},
		{
			name:     "custom slug",
			envValue: "custom-bot",
			expected: "custom-bot",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.envValue != "" {
				t.Setenv("KUBESTELLAR_CONSOLE_APP_SLUG", tt.envValue)
			} else {
				t.Setenv("KUBESTELLAR_CONSOLE_APP_SLUG", "")
			}

			slug := ExpectedAppSlug()
			require.Equal(t, tt.expected, slug)
		})
	}
}

// generateTestPrivateKey generates a fresh RSA private key in PEM format.
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
