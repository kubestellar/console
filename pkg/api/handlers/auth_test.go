package handlers

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/test"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
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
		assert.Contains(t, loc.String(), "token=")
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
		assert.Contains(t, loc.String(), "token=")
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
	// Override config to simulate existing OAuth credentials
	cfg := AuthConfig{
		GitHubClientID: "client-id",
		GitHubSecret:   "secret",
		BackendURL:     "http://backend",
	}
	handler := NewAuthHandler(nil, cfg)
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

// We cannot easily test successful GitHubCallback flow without mocking oauth lib
// or doing extensive interface extraction, but we covered the error headers above.
