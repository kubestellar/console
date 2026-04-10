package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// setupAuthTest creates a fresh Fiber app and an AuthHandler with a mock store
func setupAuthTest() (*fiber.App, *test.MockStore, *AuthHandler) {
	app := fiber.New()
	mockStore := new(test.MockStore)
	cfg := AuthConfig{
		GitHubClientID: "", // Trigger DevMode
		JWTSecret:      "test-secret",
		FrontendURL:    "http://frontend",
		DevMode:        true,
	}
	handler := NewAuthHandler(mockStore, cfg)

	return app, mockStore, handler
}

func TestDevModeLogin(t *testing.T) {
	app, mockStore, handler := setupAuthTest()
	app.Get("/auth/dev", handler.devModeLogin)

	t.Run("Create new dev user success", func(t *testing.T) {
		mockStore.On("GetUserByGitHubID", "dev-dev-user").Return(nil, nil).Once()
		mockStore.On("CreateUser", mock.Anything).Return(nil).Once()
		mockStore.On("UpdateLastLogin", mock.Anything).Return(nil).Once()

		req, _ := http.NewRequest("GET", "/auth/dev", nil)
		resp, err := app.Test(req, 5000)

		assert.NoError(t, err)
		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)

		loc, _ := resp.Location()
		// Token must NOT appear in the redirect URL (#4278 — prevent JWT leakage)
		assert.NotContains(t, loc.String(), "token=")
		assert.Contains(t, loc.String(), "onboarded=true") // Dev user is auto-onboarded
	})

	t.Run("Existing dev user success", func(t *testing.T) {
		existingUser := &models.User{
			ID:          uuid.New(),
			GitHubID:    "dev-dev-user",
			GitHubLogin: "dev-user",
			Onboarded:   false,
		}

		mockStore.On("GetUserByGitHubID", "dev-dev-user").Return(existingUser, nil).Once()
		mockStore.On("UpdateUser", mock.Anything).Return(nil).Once()
		mockStore.On("UpdateLastLogin", existingUser.ID).Return(nil).Once()

		req, _ := http.NewRequest("GET", "/auth/dev", nil)
		resp, err := app.Test(req, 5000)

		assert.NoError(t, err)
		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)

		loc, _ := resp.Location()
		// Token must NOT appear in the redirect URL (#4278 — prevent JWT leakage)
		assert.NotContains(t, loc.String(), "token=")
		assert.Contains(t, loc.String(), "onboarded=false")
	})
}

func TestRefreshToken(t *testing.T) {
	app, mockStore, handler := setupAuthTest()
	app.Post("/auth/refresh", handler.RefreshToken)

	t.Run("Valid token refresh", func(t *testing.T) {
		// 1. Generate a valid token manually
		uid := uuid.New()
		user := &models.User{ID: uid, GitHubLogin: "test", Onboarded: true}
		token, _ := handler.generateJWT(user)

		// 2. Setup mock
		mockStore.On("GetUser", uid).Return(user, nil).Once()

		// 3. Request
		req, _ := http.NewRequest("POST", "/auth/refresh", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := app.Test(req, 5000)

		assert.NoError(t, err)
		assert.Equal(t, http.StatusOK, resp.StatusCode)

		var body map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&body)
		assert.NotEmpty(t, body["token"])
		assert.Equal(t, true, body["onboarded"])
	})

	t.Run("Missing Authorization Header", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/auth/refresh", nil)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("Short Authorization Header (< Bearer prefix length)", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/auth/refresh", nil)
		req.Header.Set("Authorization", "Bad")
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("Authorization Header without Bearer prefix", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/auth/refresh", nil)
		req.Header.Set("Authorization", "Basic dXNlcjpwYXNz")
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("Invalid Token", func(t *testing.T) {
		req, _ := http.NewRequest("POST", "/auth/refresh", nil)
		req.Header.Set("Authorization", "Bearer invalid-token-string")
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("User Not Found", func(t *testing.T) {
		uid := uuid.New()
		user := &models.User{ID: uid}
		token, _ := handler.generateJWT(user)

		mockStore.On("GetUser", uid).Return(nil, nil).Once()

		req, _ := http.NewRequest("POST", "/auth/refresh", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, _ := app.Test(req, 5000)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})

	t.Run("Expired Token", func(t *testing.T) {
		// Generate expired token
		claims := middleware.UserClaims{
			UserID: uuid.New(),
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(-1 * time.Hour)),
			},
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, _ := token.SignedString([]byte("test-secret"))

		req, _ := http.NewRequest("POST", "/auth/refresh", nil)
		req.Header.Set("Authorization", "Bearer "+signed)
		resp, _ := app.Test(req, 5000)

		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	})
}

func TestGitHubLogin_Redirects(t *testing.T) {
	app, _, _ := setupAuthTest()
	// Use a real SQLiteStore so the handler can persist the OAuth state
	// (the in-memory map was replaced by a store-backed write in #6028).
	dbPath := filepath.Join(t.TempDir(), "github-login.db")
	s, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s.Close()
	// Override config to simulate existing OAuth credentials
	cfg := AuthConfig{
		GitHubClientID: "client-id",
		GitHubSecret:   "secret",
		BackendURL:     "http://backend",
	}
	handler := NewAuthHandler(s, cfg)
	app.Get("/auth/github", handler.GitHubLogin)

	req, _ := http.NewRequest("GET", "/auth/github", nil)
	resp, err := app.Test(req, 5000)

	assert.NoError(t, err)
	assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)

	loc, _ := resp.Location()
	assert.Contains(t, loc.String(), "github.com/login/oauth/authorize")
	assert.Contains(t, loc.String(), "client_id=client-id")
}

func TestGenerateJWT(t *testing.T) {
	_, _, handler := setupAuthTest()
	user := &models.User{
		ID:          uuid.New(),
		GitHubLogin: "test-user",
	}

	token, err := handler.generateJWT(user)
	assert.NoError(t, err)
	assert.NotEmpty(t, token)

	// Verify manually
	parsed, err := jwt.ParseWithClaims(token, &middleware.UserClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte("test-secret"), nil
	})
	assert.NoError(t, err)
	claims, ok := parsed.Claims.(*middleware.UserClaims)
	assert.True(t, ok)
	assert.Equal(t, user.ID, claims.UserID)
	assert.Equal(t, "test-user", claims.GitHubLogin)
}

func TestGitHubCallback_MissingCode(t *testing.T) {
	app, _, handler := setupAuthTest()
	app.Get("/auth/callback", handler.GitHubCallback)

	req, _ := http.NewRequest("GET", "/auth/callback", nil)
	resp, err := app.Test(req, 5000)
	if err != nil || resp == nil {
		t.Fatalf("app.Test failed: %v", err)
	}

	assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
	loc, _ := resp.Location()
	assert.Contains(t, loc.String(), "error=missing_code")
}

func TestGitHubCallback_InvalidState(t *testing.T) {
	app, _, handler := setupAuthTest()
	app.Get("/auth/callback", handler.GitHubCallback)

	// Provide code but no state
	req, _ := http.NewRequest("GET", "/auth/callback?code=123", nil)
	resp, err := app.Test(req, 5000)
	if err != nil || resp == nil {
		t.Fatalf("app.Test failed: %v", err)
	}

	assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
	loc, _ := resp.Location()
	assert.Contains(t, loc.String(), "error=csrf_validation_failed")
}

func TestGitHubCallback_GitHubError(t *testing.T) {
	app, _, handler := setupAuthTest()
	app.Get("/auth/callback", handler.GitHubCallback)

	t.Run("Access denied by user", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/auth/callback?error=access_denied&error_description=The+user+denied+access", nil)
		resp, err := app.Test(req, 5000)
		if err != nil || resp == nil {
			t.Fatalf("app.Test failed: %v", err)
		}

		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
		loc, _ := resp.Location()
		assert.Contains(t, loc.String(), "error=access_denied")
		assert.Contains(t, loc.String(), "error_detail=")
	})

	t.Run("Generic GitHub error", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/auth/callback?error=application_suspended&error_description=App+is+suspended", nil)
		resp, err := app.Test(req, 5000)
		if err != nil || resp == nil {
			t.Fatalf("app.Test failed: %v", err)
		}

		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
		loc, _ := resp.Location()
		assert.Contains(t, loc.String(), "error=github_error")
		assert.Contains(t, loc.String(), "error_detail=")
	})
}

func TestClassifyExchangeError(t *testing.T) {
	t.Run("Incorrect client credentials", func(t *testing.T) {
		err := fmt.Errorf("oauth2: cannot fetch token: 401 Unauthorized\nResponse: incorrect_client_credentials")
		code, _ := classifyExchangeError(err)
		assert.Equal(t, "invalid_client", code)
	})

	t.Run("Redirect URI mismatch", func(t *testing.T) {
		err := fmt.Errorf("oauth2: cannot fetch token: 400 Bad Request\nResponse: redirect_uri_mismatch")
		code, _ := classifyExchangeError(err)
		assert.Equal(t, "redirect_mismatch", code)
	})

	t.Run("Bad verification code", func(t *testing.T) {
		err := fmt.Errorf("oauth2: cannot fetch token: 400 Bad Request\nResponse: bad_verification_code")
		code, _ := classifyExchangeError(err)
		assert.Equal(t, "exchange_failed", code)
	})

	t.Run("Generic exchange error", func(t *testing.T) {
		err := fmt.Errorf("some unknown error from oauth2 library")
		code, _ := classifyExchangeError(err)
		assert.Equal(t, "exchange_failed", code)
	})
}

// TestGitHubCallback_RecoversFromValidCookieOnStateFailure covers #6064:
// when CSRF state validation fails (stale OAuth tab, server restart that
// cleared the in-memory state store, etc.) the callback must check whether
// the request already carries a valid kc_auth cookie. If so, it should
// redirect to "/" and preserve the live session instead of bouncing the
// user to the error page and forcing a pointless re-login. If the cookie
// is missing, expired, or signed with a different secret, the classic
// error redirect still applies.
func TestGitHubCallback_RecoversFromValidCookieOnStateFailure(t *testing.T) {
	app, _, handler := setupAuthTest()
	app.Get("/auth/callback", handler.GitHubCallback)

	const (
		validCookieLifetime = time.Hour
		expiredCookieAge    = -1 * time.Hour
	)

	t.Run("valid cookie + invalid state redirects to /", func(t *testing.T) {
		user := &models.User{ID: uuid.New(), GitHubLogin: "already-signed-in"}
		cookieToken, err := handler.generateJWT(user)
		assert.NoError(t, err)

		req, _ := http.NewRequest("GET", "/auth/callback?code=123&state=bogus", nil)
		req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: cookieToken})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)

		loc, _ := resp.Location()
		assert.Equal(t, "/", loc.Path,
			"valid cookie should recover to frontend root, not error page")
		assert.NotContains(t, loc.String(), "error=csrf_validation_failed",
			"error page must not be used when a valid session cookie is present")
	})

	t.Run("missing cookie + invalid state redirects to error page", func(t *testing.T) {
		req, _ := http.NewRequest("GET", "/auth/callback?code=123&state=bogus", nil)

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)

		loc, _ := resp.Location()
		assert.Contains(t, loc.String(), "error=csrf_validation_failed")
	})

	t.Run("expired cookie + invalid state redirects to error page", func(t *testing.T) {
		// Cookie parses but is expired — the recovery path must NOT engage.
		expiredClaims := middleware.UserClaims{
			UserID:      uuid.New(),
			GitHubLogin: "stale",
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiredCookieAge)),
			},
		}
		expiredJWT := jwt.NewWithClaims(jwt.SigningMethodHS256, expiredClaims)
		expiredSigned, _ := expiredJWT.SignedString([]byte("test-secret"))

		req, _ := http.NewRequest("GET", "/auth/callback?code=123&state=bogus", nil)
		req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: expiredSigned})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)

		loc, _ := resp.Location()
		assert.Contains(t, loc.String(), "error=csrf_validation_failed",
			"expired cookie must not trigger the #6064 recovery path")
	})

	t.Run("cookie signed with wrong secret + invalid state redirects to error page", func(t *testing.T) {
		// Cookie is non-expired but signed with a different secret — ParseJWT
		// must reject it, so the recovery path must NOT engage.
		forgedClaims := middleware.UserClaims{
			UserID:      uuid.New(),
			GitHubLogin: "forged",
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(validCookieLifetime)),
			},
		}
		forgedJWT := jwt.NewWithClaims(jwt.SigningMethodHS256, forgedClaims)
		forgedSigned, _ := forgedJWT.SignedString([]byte("not-the-real-secret"))

		req, _ := http.NewRequest("GET", "/auth/callback?code=123&state=bogus", nil)
		req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: forgedSigned})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)

		loc, _ := resp.Location()
		assert.Contains(t, loc.String(), "error=csrf_validation_failed",
			"wrong-secret cookie must not trigger the #6064 recovery path")
	})

	t.Run("empty state + valid cookie still recovers to /", func(t *testing.T) {
		// state missing entirely (not just invalid) should also recover.
		user := &models.User{ID: uuid.New(), GitHubLogin: "empty-state"}
		cookieToken, err := handler.generateJWT(user)
		assert.NoError(t, err)

		req, _ := http.NewRequest("GET", "/auth/callback?code=123", nil)
		req.AddCookie(&http.Cookie{Name: jwtCookieName, Value: cookieToken})

		resp, err := app.Test(req, 5000)
		assert.NoError(t, err)
		assert.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)

		loc, _ := resp.Location()
		assert.Equal(t, "/", loc.Path)
	})
}

// We cannot easily test successful GitHubCallback flow without mocking oauth lib
// or doing extensive interface extraction, but we covered the error paths above.

// newRealStoreAuthHandler creates an AuthHandler backed by a real SQLiteStore
// so tests can exercise persistence behavior (#6028). Using a real store
// instead of the mock lets us verify the end-to-end OAuth state round-trip
// without wiring up testify expectations for every internal call.
func newRealStoreAuthHandler(t *testing.T) (*AuthHandler, store.Store) {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "auth-test.db")
	s, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	t.Cleanup(func() { _ = s.Close() })

	cfg := AuthConfig{
		GitHubClientID: "client-id",
		GitHubSecret:   "secret",
		JWTSecret:      "test-secret",
		FrontendURL:    "http://frontend",
		BackendURL:     "http://backend",
	}
	return NewAuthHandler(s, cfg), s
}

// TestOAuthStatePersistence_RoundTrip verifies that a state stored via the
// handler helper can be consumed via the handler helper on the happy path.
func TestOAuthStatePersistence_RoundTrip(t *testing.T) {
	h, _ := newRealStoreAuthHandler(t)

	const state = "round-trip-state"
	require.NoError(t, h.storeOAuthState(state))

	ok := h.validateAndConsumeOAuthState(state)
	assert.True(t, ok, "freshly stored state should validate")

	// Single-use: a second call must fail.
	ok = h.validateAndConsumeOAuthState(state)
	assert.False(t, ok, "consumed state should not validate twice")
}

// TestOAuthStatePersistence_SurvivesRestart simulates the #6028 scenario:
// the backend restarts between /auth/login and /auth/callback. The user's
// state was written to the persistent store on /login, and after a restart
// the callback can still consume it successfully. With the old in-memory
// map this test would fail with csrf_validation_failed.
func TestOAuthStatePersistence_SurvivesRestart(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "restart.db")

	// First "process" — /auth/login stores the state.
	s1, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	h1 := NewAuthHandler(s1, AuthConfig{
		GitHubClientID: "client-id",
		GitHubSecret:   "secret",
		JWTSecret:      "test-secret",
		FrontendURL:    "http://frontend",
		BackendURL:     "http://backend",
	})
	const state = "state-across-restart"
	require.NoError(t, h1.storeOAuthState(state))
	require.NoError(t, s1.Close())

	// Second "process" — /auth/callback consumes the state after restart.
	s2, err := store.NewSQLiteStore(dbPath)
	require.NoError(t, err)
	defer s2.Close()
	h2 := NewAuthHandler(s2, AuthConfig{
		GitHubClientID: "client-id",
		GitHubSecret:   "secret",
		JWTSecret:      "test-secret",
		FrontendURL:    "http://frontend",
		BackendURL:     "http://backend",
	})

	ok := h2.validateAndConsumeOAuthState(state)
	assert.True(t, ok, "OAuth state must survive backend restart (#6028)")
}

// TestOAuthStatePersistence_InvalidStateRejected ensures unknown states
// continue to fail CSRF validation — no regression in the rejection path.
func TestOAuthStatePersistence_InvalidStateRejected(t *testing.T) {
	h, _ := newRealStoreAuthHandler(t)
	assert.False(t, h.validateAndConsumeOAuthState("never-issued"))
}
