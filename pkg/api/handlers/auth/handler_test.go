package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/stretchr/testify/require"
)

func TestNewAuthHandler(t *testing.T) {
	s := store.OpenTestDB(t)

	tests := []struct {
		name   string
		cfg    AuthConfig
		expect func(t *testing.T, h *AuthHandler)
	}{
		{
			name: "dev mode enabled",
			cfg: AuthConfig{
				DevMode:        true,
				DevUserLogin:   "test-user",
				DevUserEmail:   "test@example.com",
				JWTSecret:      "test-secret",
				FrontendURL:    "http://localhost:5174",
				BackendURL:     "http://localhost:8080",
				SkipOnboarding: true,
			},
			expect: func(t *testing.T, h *AuthHandler) {
				require.True(t, h.devMode)
				require.Equal(t, "test-user", h.devUserLogin)
				require.Equal(t, "test@example.com", h.devUserEmail)
				require.True(t, h.skipOnboarding)
			},
		},
		{
			name: "oauth mode",
			cfg: AuthConfig{
				GitHubClientID: "client-id",
				GitHubSecret:   "secret",
				GitHubURL:      "https://github.com",
				JWTSecret:      "jwt-secret",
				FrontendURL:    "http://localhost:5174",
				BackendURL:     "http://localhost:8080",
			},
			expect: func(t *testing.T, h *AuthHandler) {
				require.False(t, h.devMode)
				require.NotNil(t, h.oauthConfig)
				require.Equal(t, "client-id", h.oauthConfig.ClientID)
			},
		},
		{
			name: "custom github url",
			cfg: AuthConfig{
				GitHubClientID: "client-id",
				GitHubSecret:   "secret",
				GitHubURL:      "https://github.enterprise.com",
				JWTSecret:      "jwt-secret",
				FrontendURL:    "http://localhost:5174",
				BackendURL:     "http://localhost:8080",
			},
			expect: func(t *testing.T, h *AuthHandler) {
				require.Contains(t, h.githubAPIBase, "github.enterprise.com")
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			h := NewAuthHandler(s, tc.cfg)
			t.Cleanup(h.Stop)
			require.NotNil(t, h)
			tc.expect(t, h)
		})
	}
}

func TestAuthHandler_DevMode(t *testing.T) {
	s := store.OpenTestDB(t)
	ctx := context.Background()

	h := NewAuthHandler(s, AuthConfig{
		DevMode:        true,
		DevUserLogin:   "dev-user",
		DevUserEmail:   "dev@example.com",
		DevUserAvatar:  "https://example.com/avatar.png",
		JWTSecret:      "test-jwt-secret",
		FrontendURL:    "http://localhost:5174",
		SkipOnboarding: true,
	})
	t.Cleanup(h.Stop)

	app := fiber.New()
	app.Get("/auth/github", h.GitHubLogin)

	req := httptest.NewRequest(http.MethodGet, "/auth/github", nil)
	resp, err := app.Test(req, -1)
	require.NoError(t, err)
	require.Equal(t, fiber.StatusTemporaryRedirect, resp.StatusCode)

	users, err := s.ListUsers(ctx, 0, 0)
	require.NoError(t, err)
	require.Greater(t, len(users), 0, "dev mode should auto-create user")

	var devUser *models.User
	for _, u := range users {
		if u.GitHubLogin == "dev-user" {
			devUser = &u
			break
		}
	}
	require.NotNil(t, devUser, "dev-user should exist")
	require.Equal(t, "dev@example.com", devUser.Email)
}

func TestAuthHandler_RevokeToken(t *testing.T) {
	s := store.OpenTestDB(t)
	ctx := context.Background()

	jti := uuid.New().String()
	expiresAt := time.Now().Add(time.Hour)

	err := s.RevokeToken(ctx, jti, expiresAt)
	require.NoError(t, err)

	revoked, err := s.IsTokenRevoked(ctx, jti)
	require.NoError(t, err)
	require.True(t, revoked)

	revoked, err = s.IsTokenRevoked(ctx, "nonexistent-jti")
	require.NoError(t, err)
	require.False(t, revoked)
}

func TestAuthHandler_OAuthStateManagement(t *testing.T) {
	s := store.OpenTestDB(t)
	ctx := context.Background()

	tests := []struct {
		name      string
		state     string
		ttl       time.Duration
		delay     time.Duration
		expectOK  bool
		expectErr bool
	}{
		{
			name:     "valid state consumed once",
			state:    "state-valid-1",
			ttl:      time.Hour,
			delay:    0,
			expectOK: true,
		},
		{
			name:     "expired state rejected",
			state:    "state-expired",
			ttl:      time.Millisecond,
			delay:    50 * time.Millisecond,
			expectOK: false,
		},
		{
			name:     "nonexistent state rejected",
			state:    "state-nonexistent",
			ttl:      0,
			delay:    0,
			expectOK: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.ttl > 0 {
				err := s.StoreOAuthState(ctx, tc.state, tc.ttl)
				require.NoError(t, err)
			}

			if tc.delay > 0 {
				time.Sleep(tc.delay)
			}

			ok, err := s.ConsumeOAuthState(ctx, tc.state)
			if tc.expectErr {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
			}
			require.Equal(t, tc.expectOK, ok)

			if tc.expectOK {
				ok2, err := s.ConsumeOAuthState(ctx, tc.state)
				require.NoError(t, err)
				require.False(t, ok2, "state should not be consumable twice")
			}
		})
	}
}

func TestAuthHandler_CleanupExpiredTokens(t *testing.T) {
	s := store.OpenTestDB(t)
	ctx := context.Background()

	jti1 := uuid.New().String()
	jti2 := uuid.New().String()
	jti3 := uuid.New().String()

	now := time.Now().UTC()
	expiredTime := now.Add(-time.Hour)
	futureTime := now.Add(time.Hour)

	require.NoError(t, s.RevokeToken(ctx, jti1, expiredTime))
	require.NoError(t, s.RevokeToken(ctx, jti2, expiredTime))
	require.NoError(t, s.RevokeToken(ctx, jti3, futureTime))

	count, err := s.CleanupExpiredTokens(ctx)
	require.NoError(t, err)
	require.Equal(t, int64(2), count, "should clean up 2 expired tokens")

	revoked1, err := s.IsTokenRevoked(ctx, jti1)
	require.NoError(t, err)
	require.False(t, revoked1, "expired token should be cleaned up")

	revoked3, err := s.IsTokenRevoked(ctx, jti3)
	require.NoError(t, err)
	require.True(t, revoked3, "future token should remain")
}
