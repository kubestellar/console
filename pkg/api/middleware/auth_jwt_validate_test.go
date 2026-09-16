package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateJWT(t *testing.T) {
	secret := "test-secret"

	t.Run("Valid", func(t *testing.T) {
		token, _ := generateTestToken(secret, time.Now().Add(time.Hour))
		claims, err := ValidateJWT(token, secret)
		assert.NoError(t, err)
		assert.NotNil(t, claims)
	})

	t.Run("Expired", func(t *testing.T) {
		token, _ := generateTestToken(secret, time.Now().Add(-1*time.Hour))
		_, err := ValidateJWT(token, secret)
		assert.Error(t, err)
	})

	t.Run("Invalid Signature", func(t *testing.T) {
		token, _ := generateTestToken("wrong", time.Now().Add(time.Hour))
		_, err := ValidateJWT(token, secret)
		assert.Error(t, err)
	})
}

type userValidationTestStore struct {
	user  *models.User
	err   error
	calls int
}

func (s *userValidationTestStore) GetUser(_ context.Context, id uuid.UUID) (*models.User, error) {
	s.calls++
	if s.user != nil && s.user.ID != id {
		return nil, nil
	}
	return s.user, s.err
}

func TestValidateJWT_NoID(t *testing.T) {
	secret := "test-secret"
	claims := UserClaims{
		UserID: uuid.New(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := tok.SignedString([]byte(secret))

	got, err := ValidateJWT(signed, secret)
	assert.NoError(t, err)
	assert.NotNil(t, got)
	assert.Empty(t, got.ID)
}

func TestJWTAuth_UserValidation(t *testing.T) {
	resetUserValidationForTest()
	t.Cleanup(resetUserValidationForTest)

	secret := "test-secret"
	userID := uuid.New()
	app := fiber.New()
	app.Get("/protected", JWTAuth(secret), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	makeToken := func(role models.UserRole) string {
		t.Helper()
		claims := UserClaims{
			UserID:      userID,
			GitHubLogin: "test-user",
			Role:        role,
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        uuid.NewString(),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, err := tok.SignedString([]byte(secret))
		require.NoError(t, err)
		return signed
	}

	t.Run("rejects deleted users", func(t *testing.T) {
		store := &userValidationTestStore{}
		InitUserValidation(store)

		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+makeToken(models.UserRoleViewer))
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
		assert.Equal(t, 1, store.calls)
	})

	t.Run("rejects role changes", func(t *testing.T) {
		store := &userValidationTestStore{user: &models.User{ID: userID, Role: models.UserRoleViewer}}
		InitUserValidation(store)

		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+makeToken(models.UserRoleAdmin))
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusUnauthorized, resp.StatusCode)
		assert.Equal(t, 1, store.calls)
	})

	t.Run("caches successful lookups", func(t *testing.T) {
		store := &userValidationTestStore{user: &models.User{ID: userID, Role: models.UserRoleViewer}}
		InitUserValidation(store)
		token := makeToken(models.UserRoleViewer)

		for i := 0; i < 2; i++ {
			req := httptest.NewRequest(http.MethodGet, "/protected", nil)
			req.Host = "localhost"
			req.Header.Set("Authorization", "Bearer "+token)
			resp, err := app.Test(req, 5000)
			require.NoError(t, err)
			assert.Equal(t, fiber.StatusOK, resp.StatusCode)
		}
		assert.Equal(t, 1, store.calls)
	})

	t.Run("fails closed on lookup errors", func(t *testing.T) {
		store := &userValidationTestStore{err: assertErr{}}
		InitUserValidation(store)

		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Host = "localhost"
		req.Header.Set("Authorization", "Bearer "+makeToken(models.UserRoleViewer))
		resp, err := app.Test(req, 5000)
		require.NoError(t, err)
		assert.Equal(t, fiber.StatusServiceUnavailable, resp.StatusCode)
		assert.Equal(t, 1, store.calls)
	})
}
