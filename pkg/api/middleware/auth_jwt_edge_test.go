package middleware

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestParseJWT_EdgeCases covers edge cases in JWT parsing and validation
// that weren't previously tested, improving coverage for #17774.
func TestParseJWT_EdgeCases(t *testing.T) {
	secret := "test-secret"

	tests := []struct {
		name        string
		tokenString string
		wantErr     bool
		errContains string
	}{
		{
			name:        "empty token string",
			tokenString: "",
			wantErr:     true,
			errContains: "token",
		},
		{
			name:        "malformed token - not JWT format",
			tokenString: "not-a-jwt-token",
			wantErr:     true,
			errContains: "token",
		},
		{
			name:        "malformed token - only header",
			tokenString: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
			wantErr:     true,
			errContains: "token",
		},
		{
			name:        "malformed token - header and payload only",
			tokenString: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0",
			wantErr:     true,
			errContains: "token",
		},
		{
			name:        "malformed token - invalid base64",
			tokenString: "not-base64.also-not-base64.still-not-base64",
			wantErr:     true,
			errContains: "token",
		},
		{
			name:        "token with corrupted signature",
			tokenString: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.corrupted",
			wantErr:     true,
			errContains: "signature",
		},
	}

	for _, tc := range tests {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseJWT(tc.tokenString, secret)
			if tc.wantErr {
				require.Error(t, err)
				if tc.errContains != "" {
					assert.Contains(t, err.Error(), tc.errContains)
				}
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

// TestValidateJWT_EdgeCases covers additional edge cases in ValidateJWT
// for improved coverage (#17774).
func TestValidateJWT_EdgeCases(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	secret := "test-secret"

	t.Run("empty token string", func(t *testing.T) {
		_, err := ValidateJWT("", secret)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "token")
	})

	t.Run("malformed token", func(t *testing.T) {
		_, err := ValidateJWT("not-a-jwt", secret)
		require.Error(t, err)
	})

	t.Run("token with nil UserID", func(t *testing.T) {
		claims := UserClaims{
			UserID:      uuid.Nil,
			GitHubLogin: "test",
			Role:        models.UserRoleViewer,
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        uuid.NewString(),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, _ := tok.SignedString([]byte(secret))

		// Should still validate even with nil UUID
		got, err := ValidateJWT(signed, secret)
		assert.NoError(t, err)
		assert.NotNil(t, got)
		assert.Equal(t, uuid.Nil, got.UserID)
	})

	t.Run("token with empty GitHub login", func(t *testing.T) {
		claims := UserClaims{
			UserID:      uuid.New(),
			GitHubLogin: "",
			Role:        models.UserRoleViewer,
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        uuid.NewString(),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, _ := tok.SignedString([]byte(secret))

		got, err := ValidateJWT(signed, secret)
		assert.NoError(t, err)
		assert.NotNil(t, got)
		assert.Empty(t, got.GitHubLogin)
	})

	t.Run("token missing expiration", func(t *testing.T) {
		claims := UserClaims{
			UserID:      uuid.New(),
			GitHubLogin: "test",
			Role:        models.UserRoleViewer,
			RegisteredClaims: jwt.RegisteredClaims{
				ID: uuid.NewString(),
				// No ExpiresAt
			},
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, _ := tok.SignedString([]byte(secret))

		// JWT library treats missing exp as infinite, but this is still valid
		got, err := ValidateJWT(signed, secret)
		assert.NoError(t, err)
		assert.NotNil(t, got)
	})

	t.Run("token not yet valid (nbf in future)", func(t *testing.T) {
		claims := UserClaims{
			UserID:      uuid.New(),
			GitHubLogin: "test",
			Role:        models.UserRoleViewer,
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        uuid.NewString(),
				NotBefore: jwt.NewNumericDate(time.Now().Add(time.Hour)),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(2 * time.Hour)),
			},
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, _ := tok.SignedString([]byte(secret))

		_, err := ValidateJWT(signed, secret)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "not valid yet")
	})

	t.Run("token with wrong secret", func(t *testing.T) {
		wrongSecret := "wrong-secret"
		claims := UserClaims{
			UserID:      uuid.New(),
			GitHubLogin: "test",
			Role:        models.UserRoleViewer,
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        uuid.NewString(),
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, _ := tok.SignedString([]byte(wrongSecret))

		_, err := ValidateJWT(signed, secret)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "signature")
	})
}

// TestParseJWT_InvalidClaims tests ParseJWT behavior with claims that cannot
// be cast to UserClaims (edge case for coverage #17774).
func TestParseJWT_InvalidClaims(t *testing.T) {
	secret := "test-secret"

	// Create a token with standard claims instead of UserClaims
	stdClaims := jwt.RegisteredClaims{
		Subject:   "test-subject",
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, stdClaims)
	signed, err := tok.SignedString([]byte(secret))
	require.NoError(t, err)

	// ParseJWT should still parse it, but when we try to cast to UserClaims
	// in ValidateJWT, it should fail
	token, err := ParseJWT(signed, secret)
	require.NoError(t, err)
	assert.NotNil(t, token)

	// ParseJWT always uses &UserClaims{}, so type assertion succeeds,
	// but UserClaims-specific fields should be zero-value for a standard claims token
	uc, ok := token.Claims.(*UserClaims)
	assert.True(t, ok, "claims should be *UserClaims (ParseJWT always uses UserClaims)")
	if ok {
		assert.Equal(t, uuid.Nil, uc.UserID, "UserID should be zero-value for standard claims token")
		assert.Empty(t, uc.GitHubLogin, "GitHubLogin should be zero-value for standard claims token")
	}
}
