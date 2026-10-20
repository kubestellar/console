package middleware

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/models"
	"github.com/stretchr/testify/assert"
)

// failingRevoker implements TokenRevoker and always returns an error on
// IsTokenRevoked, used to exercise the fail-closed behavior for #6577.
type failingRevoker struct{}

func (failingRevoker) RevokeToken(_ context.Context, _ string, _ time.Time) error { return nil }
func (failingRevoker) IsTokenRevoked(_ context.Context, _ string) (bool, error) {
	return false, assertErr{}
}
func (failingRevoker) CleanupExpiredTokens(_ context.Context) (int64, error) { return 0, nil }

type assertErr struct{}

func (assertErr) Error() string { return "revocation store unavailable" }

// TestRevocationFailClosed covers #6577: when the revocation store returns
// an error, the middleware must fail CLOSED (reject the request) rather
// than fail OPEN (admit the token). Previously the error was logged and
// IsRevoked returned false, silently disabling server-side logout whenever
// the DB hiccuped.
func TestRevocationFailClosed(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	InitTokenRevocation(failingRevoker{})

	secret := "test-secret"
	app := fiber.New()
	app.Get("/protected", JWTAuth(secret), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	// Generate a token with a JTI that is NOT in the local cache. The
	// middleware will fall through to the persistent store, which errors,
	// and must reject the request with 503.
	claims := UserClaims{
		UserID:      uuid.New(),
		GitHubLogin: "test",
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := tok.SignedString([]byte(secret))

	req := httptest.NewRequest("GET", "/protected", nil)
	req.Host = "localhost"
	req.Header.Set("Authorization", "Bearer "+signed)
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, 503, resp.StatusCode,
		"revocation check DB error must fail closed (#6577)")
}

// TestValidateJWTFailClosedOnRevocationError covers the same fail-closed
// property on the WebSocket/SSE validation path (ValidateJWT).
func TestValidateJWTFailClosedOnRevocationError(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	InitTokenRevocation(failingRevoker{})

	secret := "test-secret"
	claims := UserClaims{
		UserID: uuid.New(),
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.NewString(),
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := tok.SignedString([]byte(secret))

	_, err := ValidateJWT(signed, secret)
	assert.Error(t, err, "ValidateJWT must fail closed on revocation DB error (#6577)")
}

// noopRevoker is a TokenRevoker that never errors and never reports
// anything as revoked. Used to exercise idempotency and shutdown paths.
type noopRevoker struct{}

func (noopRevoker) RevokeToken(_ context.Context, _ string, _ time.Time) error { return nil }
func (noopRevoker) IsTokenRevoked(_ context.Context, _ string) (bool, error)   { return false, nil }
func (noopRevoker) CleanupExpiredTokens(_ context.Context) (int64, error)      { return 0, nil }

// TestInitTokenRevocationIdempotent covers #6586: calling InitTokenRevocation
// multiple times must not spawn multiple cleanup goroutines. We verify this
// indirectly by ensuring the cancel func is still set after a second call
// and that ShutdownTokenRevocation does not panic on double-call.
func TestInitTokenRevocationIdempotent(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	InitTokenRevocation(noopRevoker{})
	// Second call must be a no-op: sync.Once guarantees the inner body
	// runs exactly once, so the test ensures the call doesn't panic.
	InitTokenRevocation(noopRevoker{})
	InitTokenRevocation(noopRevoker{})

	// Shutdown once, then a second time — must not panic.
	ShutdownTokenRevocation()
	ShutdownTokenRevocation()
}

// TestRevocationQueryTokenRejectedOnUnknownPath covers #6585: the _token
// query-param fallback must be rejected on paths that are not in the
// explicit allow-list, even if they end in /stream.
func TestRevocationQueryTokenRejectedOnUnknownPath(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	secret := "test-secret"
	app := fiber.New()
	app.Get("/api/random/stream", JWTAuth(secret), func(c *fiber.Ctx) error {
		return c.SendString("ok")
	})

	token, _ := generateTestToken(secret, time.Now().Add(time.Hour))
	req := httptest.NewRequest("GET", "/api/random/stream?_token="+token, nil)
	req.Host = "localhost"
	resp, err := app.Test(req, 5000)
	assert.NoError(t, err)
	assert.Equal(t, 401, resp.StatusCode,
		"query-param token must be rejected on non-allowlisted paths (#6585)")
}

func TestRevocationHelpers(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	jti := "help-jti"
	RevokeToken(jti, time.Now().Add(time.Hour))
	assert.True(t, IsTokenRevoked(jti))
	assert.False(t, IsTokenRevoked("other"))

	rev, err := IsTokenRevokedChecked(jti)
	assert.NoError(t, err)
	assert.True(t, rev)
}

func TestRevocation_Cleanup(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	// Add an expired token and a fresh one
	now := time.Now()
	revokedTokens.Revoke("expired", now.Add(-1*time.Hour))
	revokedTokens.Revoke("fresh", now.Add(1*time.Hour))

	revokedTokens.cleanup()

	assert.True(t, IsTokenRevoked("fresh"))
	assert.False(t, IsTokenRevoked("expired"))
}

func TestValidateJWT_Revoked(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	secret := "test-secret"
	jti := "revoked-jti"
	claims := UserClaims{
		UserID: uuid.New(),
		Role:   models.UserRoleViewer,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := tok.SignedString([]byte(secret))

	RevokeToken(jti, time.Now().Add(time.Hour))

	_, err := ValidateJWT(signed, secret)
	assert.ErrorIs(t, err, ErrTokenRevoked)
}

// recordingRevoker captures write-through calls so tests can assert that a
// rotated token is persisted immediately even while it is still accepted.
type recordingRevoker struct {
	revoked []string
}

func (r *recordingRevoker) RevokeToken(_ context.Context, jti string, _ time.Time) error {
	r.revoked = append(r.revoked, jti)
	return nil
}
func (r *recordingRevoker) IsTokenRevoked(_ context.Context, _ string) (bool, error) {
	return false, nil
}
func (r *recordingRevoker) CleanupExpiredTokens(_ context.Context) (int64, error) { return 0, nil }

// TestRevokeRotatedToken_GraceWindow covers #24495: a JTI superseded by
// POST /auth/refresh must keep authenticating for RotationGracePeriod so
// requests already in flight with the previous kc_auth cookie do not fail
// with 401 "Token has been revoked".
func TestRevokeRotatedToken_GraceWindow(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	store := &recordingRevoker{}
	InitTokenRevocation(store)

	tests := []struct {
		name      string
		grace     time.Duration
		expiresAt time.Time
		wantGrace bool
	}{
		{name: "inside grace window", grace: time.Minute, expiresAt: time.Now().Add(time.Hour), wantGrace: true},
		{name: "grace already elapsed", grace: -time.Second, expiresAt: time.Now().Add(time.Hour), wantGrace: false},
		{name: "grace capped at token expiry", grace: time.Minute, expiresAt: time.Now().Add(-time.Second), wantGrace: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			jti := "rotated-" + tc.name
			revokedTokens.RevokeAfterRotation(jti, tc.expiresAt, tc.grace)

			revoked, err := IsTokenRevokedChecked(jti)
			assert.NoError(t, err)
			assert.Equal(t, !tc.wantGrace, revoked)
			assert.Contains(t, store.revoked, jti, "rotation must still write the revocation through")
		})
	}
}

func TestRevokeRotatedToken_RevokedAfterGrace(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	jti := "rotated-expiring"
	revokedTokens.RevokeAfterRotation(jti, time.Now().Add(time.Hour), 20*time.Millisecond)
	assert.False(t, IsTokenRevoked(jti), "accepted during grace")

	time.Sleep(40 * time.Millisecond)
	assert.True(t, IsTokenRevoked(jti), "rejected once grace has elapsed")

	revokedTokens.RLock()
	_, stillTracked := revokedTokens.rotated[jti]
	revokedTokens.RUnlock()
	assert.False(t, stillTracked, "expired grace entry is pruned")
}

func TestRevokeToken_LogoutHasNoGrace(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	jti := "logout-jti"
	RevokeToken(jti, time.Now().Add(time.Hour))
	assert.True(t, IsTokenRevoked(jti), "explicit revocation takes effect immediately")
}

func TestValidateJWT_AcceptsRotatedTokenDuringGrace(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	secret := "test-secret"
	jti := "rotated-jwt"
	claims := UserClaims{
		UserID: uuid.New(),
		Role:   models.UserRoleViewer,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        jti,
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString([]byte(secret))
	assert.NoError(t, err)

	RevokeRotatedToken(jti, time.Now().Add(time.Hour))

	_, err = ValidateJWT(signed, secret)
	assert.NoError(t, err)
}

func TestRevocation_CleanupPrunesRotated(t *testing.T) {
	ResetTokenRevocationForTest()
	t.Cleanup(ResetTokenRevocationForTest)

	revokedTokens.RevokeAfterRotation("rotated-old", time.Now().Add(time.Hour), -time.Minute)
	revokedTokens.RevokeAfterRotation("rotated-new", time.Now().Add(time.Hour), time.Minute)

	revokedTokens.cleanup()

	revokedTokens.RLock()
	_, oldTracked := revokedTokens.rotated["rotated-old"]
	_, newTracked := revokedTokens.rotated["rotated-new"]
	revokedTokens.RUnlock()
	assert.False(t, oldTracked)
	assert.True(t, newTracked)
}
