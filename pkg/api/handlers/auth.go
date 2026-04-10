package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"golang.org/x/oauth2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// bearerPrefix is the standard "Bearer " prefix in Authorization headers.
const bearerPrefix = "Bearer "

// bearerPrefixLen is the length of the "Bearer " prefix (7 bytes).
// Used to safely slice Authorization headers after validating the prefix.
const bearerPrefixLen = len(bearerPrefix)

const (
	// oauthStateExpiration is how long an OAuth state token remains valid.
	oauthStateExpiration = 10 * time.Minute
	// oauthStateCleanupInterval is how often the background goroutine sweeps
	// for expired OAuth state entries in the persistent store.
	oauthStateCleanupInterval = 5 * time.Minute
	// jwtExpiration is the lifetime of issued JWT tokens.
	// Set to 7 days — the auth middleware signals clients to silently refresh
	// after 50% of the lifetime (3.5 days) via the X-Token-Refresh header,
	// so users rarely see session-expired redirects.
	jwtExpiration = 168 * time.Hour
	// githubHTTPTimeout is the timeout for HTTP requests to the GitHub API during auth.
	githubHTTPTimeout = 10 * time.Second
	// defaultOAuthCallbackURL is the fallback OAuth callback when no backend URL is configured.
	defaultOAuthCallbackURL = "http://localhost:8080/auth/github/callback"
)

// storeOAuthState persists an OAuth CSRF state token in the backing store.
//
// Previously this lived in an in-process map, which meant a backend restart
// between /auth/login and /auth/callback would drop every in-flight OAuth
// flow and surface as `csrf_validation_failed` to users (issue #6028). The
// persistent store makes OAuth flows resilient across restarts, as long as
// the user completes the flow within oauthStateExpiration.
func (h *AuthHandler) storeOAuthState(state string) error {
	return h.store.StoreOAuthState(state, oauthStateExpiration)
}

// validateAndConsumeOAuthState atomically looks up and deletes an OAuth state
// token. Returns true only when the state was found, had not expired, and was
// successfully consumed (single-use). Returns false on any error or miss so
// callers can respond with a generic csrf_validation_failed without leaking
// details.
func (h *AuthHandler) validateAndConsumeOAuthState(state string) bool {
	ok, err := h.store.ConsumeOAuthState(state)
	if err != nil {
		slog.Error("[Auth] failed to consume OAuth state", "error", err)
		return false
	}
	return ok
}

// isLocalhostURL returns true if the given URL points to a loopback address
// (localhost, 127.x.x.x, or [::1]). Used to decide whether the localhost
// OAuth callback fallback is appropriate.
func isLocalhostURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := u.Hostname()
	if host == "localhost" {
		return true
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// AuthConfig holds authentication configuration
type AuthConfig struct {
	GitHubClientID string
	GitHubSecret   string
	GitHubURL      string // Base GitHub URL (e.g., "https://github.ibm.com"), defaults to "https://github.com"
	JWTSecret      string
	FrontendURL    string
	BackendURL     string // Backend URL for OAuth callback (defaults to http://localhost:8080)
	DevUserLogin   string
	DevUserEmail   string
	DevUserAvatar  string
	GitHubToken    string // Personal access token for dev mode profile lookup
	DevMode        bool   // Force dev mode bypass even if OAuth credentials present
	SkipOnboarding bool   // Skip onboarding questionnaire for new users
}

// SessionDisconnecter is the subset of Hub needed to close WebSocket sessions
// on logout. Defined as an interface to avoid a circular dependency.
type SessionDisconnecter interface {
	DisconnectUser(userID uuid.UUID)
}

// AuthHandler handles authentication
type AuthHandler struct {
	store          store.Store
	oauthConfig    *oauth2.Config
	githubAPIBase  string // API base URL: "https://api.github.com" or "https://github.ibm.com/api/v3"
	jwtSecret      string
	frontendURL    string
	devUserLogin   string
	devUserEmail   string
	devUserAvatar  string
	githubToken    string
	devMode        bool
	skipOnboarding bool
	wsHub          SessionDisconnecter // optional — set via SetHub to disconnect WS sessions on logout
	cleanupCtx     context.Context     // cancelled by Stop to terminate the OAuth state cleanup goroutine
	cleanupCancel  context.CancelFunc  // call to stop the OAuth state cleanup goroutine
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(s store.Store, cfg AuthConfig) *AuthHandler {
	// Build OAuth redirect URL - must point to BACKEND callback endpoint
	// GitHub redirects here first, then backend redirects to frontend with JWT
	redirectURL := ""
	if cfg.BackendURL != "" {
		redirectURL = cfg.BackendURL + "/auth/github/callback"
	} else if cfg.FrontendURL != "" {
		// BACKEND_URL is not set but FRONTEND_URL is — this is likely a non-local
		// deployment where the localhost fallback will break OAuth.
		if !isLocalhostURL(cfg.FrontendURL) {
			slog.Warn("[Auth] BACKEND_URL is not set but FRONTEND_URL points to a non-local host. "+
				"OAuth callback will fall back to localhost:8080 which will fail. "+
				"Set BACKEND_URL to the public backend address.",
				"frontendURL", cfg.FrontendURL)
		}
		redirectURL = defaultOAuthCallbackURL
	}

	// Build GitHub OAuth endpoint and API base URL.
	// For github.com: OAuth at github.com, API at api.github.com
	// For GHE (e.g., github.ibm.com): OAuth at github.ibm.com, API at github.ibm.com/api/v3
	ghURL := strings.TrimRight(cfg.GitHubURL, "/")
	if ghURL == "" {
		ghURL = "https://github.com"
	}

	oauthEndpoint := oauth2.Endpoint{
		AuthURL:  ghURL + "/login/oauth/authorize",
		TokenURL: ghURL + "/login/oauth/access_token",
	}

	apiBase := "https://api.github.com"
	if ghURL != "https://github.com" {
		apiBase = ghURL + "/api/v3"
	}

	if ghURL != "https://github.com" {
		slog.Info("[Auth] GitHub Enterprise configured", "oauthURL", ghURL, "apiBase", apiBase)
	}

	cleanupCtx, cleanupCancel := context.WithCancel(context.Background())
	h := &AuthHandler{
		store: s,
		oauthConfig: &oauth2.Config{
			ClientID:     cfg.GitHubClientID,
			ClientSecret: cfg.GitHubSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"user:email"},
			Endpoint:     oauthEndpoint,
		},
		githubAPIBase:  apiBase,
		jwtSecret:      cfg.JWTSecret,
		frontendURL:    cfg.FrontendURL,
		devUserLogin:   cfg.DevUserLogin,
		devUserEmail:   cfg.DevUserEmail,
		devUserAvatar:  cfg.DevUserAvatar,
		githubToken:    cfg.GitHubToken,
		devMode:        cfg.DevMode,
		skipOnboarding: cfg.SkipOnboarding,
		cleanupCtx:     cleanupCtx,
		cleanupCancel:  cleanupCancel,
	}

	// Periodically purge expired OAuth states from the persistent store so the
	// oauth_states table does not grow unbounded in long-running processes.
	// ConsumeOAuthState deletes individual rows on the happy path, but
	// abandoned flows (user never returns to the callback) would otherwise
	// linger until their expires_at passed with no cleanup.
	//
	// Skipped in DevMode (no real OAuth client configured) so unit tests
	// that use DevMode handlers do not leak a background goroutine for
	// the lifetime of the test process (#6125).
	if cfg.GitHubClientID != "" {
		go h.runOAuthStateCleanup()
	}

	return h
}

// Stop tears down any background goroutines started by the AuthHandler
// (currently just the OAuth state cleanup ticker). Tests should call this
// via t.Cleanup so each test exits without leaking the cleanup goroutine.
// Production code does not need to call Stop — the goroutine intentionally
// runs for the lifetime of the process.
func (h *AuthHandler) Stop() {
	if h.cleanupCancel != nil {
		h.cleanupCancel()
	}
}

// runOAuthStateCleanup ticks every oauthStateCleanupInterval and removes
// expired OAuth state rows. It exits when the cleanup context is cancelled
// (via Stop) so tests do not leak the goroutine across t.Run boundaries.
func (h *AuthHandler) runOAuthStateCleanup() {
	ticker := time.NewTicker(oauthStateCleanupInterval)
	defer ticker.Stop()
	for {
		select {
		case <-h.cleanupCtx.Done():
			return
		case <-ticker.C:
			if _, err := h.store.CleanupExpiredOAuthStates(); err != nil {
				slog.Warn("[Auth] OAuth state cleanup failed", "error", err)
			}
		}
	}
}

// SetHub wires the WebSocket hub into the auth handler so that logout
// can disconnect all active WebSocket sessions for the user (#4906).
func (h *AuthHandler) SetHub(hub SessionDisconnecter) {
	h.wsHub = hub
}

const (
	// OAuth state cookie name
	oauthStateCookieName = "oauth_state"
	// oauthStateCookieMaxAge is oauthStateExpiration expressed in seconds for the browser cookie.
	// Must stay in sync with oauthStateExpiration above.
	oauthStateCookieMaxAge = 600
	// jwtCookieName is the HttpOnly cookie that carries the JWT.
	jwtCookieName = "kc_auth"
)

// GitHubLogin initiates GitHub OAuth flow
func (h *AuthHandler) GitHubLogin(c *fiber.Ctx) error {
	// Bypass OAuth only when no client ID is configured (true dev/demo mode).
	// When OAuth credentials are present, always use real GitHub login even in dev mode.
	if h.oauthConfig.ClientID == "" {
		return h.devModeLogin(c)
	}

	// Generate cryptographically secure state for CSRF protection
	state := uuid.New().String()

	// Persist state in the backing store (Safari blocks cookies in OAuth
	// redirect flows, and an in-memory map would be lost on restart — #6028).
	if err := h.storeOAuthState(state); err != nil {
		slog.Error("[Auth] failed to store OAuth state", "error", err)
		return h.oauthErrorRedirect(c, "oauth_state_store_failed", "")
	}

	url := h.oauthConfig.AuthCodeURL(state)
	// Prevent Safari from caching the 307 redirect (which contains a unique CSRF state).
	// Without this, Safari reuses a stale redirect URL whose state was already consumed,
	// causing CSRF validation to fail on the callback.
	c.Set("Cache-Control", "no-store")
	return c.Redirect(url, fiber.StatusTemporaryRedirect)
}

// devModeLogin creates a test user without GitHub OAuth
func (h *AuthHandler) devModeLogin(c *fiber.Ctx) error {
	var devLogin, devEmail, avatarURL, devGitHubID string

	// If we have a GitHub token, fetch real user info
	if h.githubToken != "" {
		ghUser, err := h.getGitHubUser(h.githubToken)
		if err == nil && ghUser != nil {
			devLogin = ghUser.Login
			devEmail = ghUser.Email
			avatarURL = ghUser.AvatarURL
			devGitHubID = fmt.Sprintf("%d", ghUser.ID)
		}
	}

	// Fall back to configured or default values
	if devLogin == "" {
		devLogin = h.devUserLogin
		if devLogin == "" {
			devLogin = "dev-user"
		}
		devGitHubID = "dev-" + devLogin
	}

	// Find or create dev user
	user, err := h.store.GetUserByGitHubID(devGitHubID)
	if err != nil {
		return c.Redirect(h.frontendURL+"/login?error=db_error", fiber.StatusTemporaryRedirect)
	}

	// Build avatar URL if not set from GitHub API
	if avatarURL == "" {
		avatarURL = h.devUserAvatar
		if avatarURL == "" && devLogin != "dev-user" {
			// Try to use GitHub avatar for the configured username
			avatarURL = "https://github.com/" + devLogin + ".png"
		}
		if avatarURL == "" {
			avatarURL = "https://github.com/identicons/dev.png"
		}
	}

	if devEmail == "" {
		devEmail = h.devUserEmail
		if devEmail == "" {
			devEmail = "dev@localhost"
		}
	}

	if user == nil {
		// Create dev user
		user = &models.User{
			GitHubID:    devGitHubID,
			GitHubLogin: devLogin,
			Email:       devEmail,
			AvatarURL:   avatarURL,
			Onboarded:   true, // Skip onboarding in dev mode
		}
		if err := h.store.CreateUser(user); err != nil {
			return c.Redirect(h.frontendURL+"/login?error=create_user_failed", fiber.StatusTemporaryRedirect)
		}
	} else {
		// Update existing user info to match config
		user.GitHubLogin = devLogin
		user.Email = devEmail
		user.AvatarURL = avatarURL
		if err := h.store.UpdateUser(user); err != nil {
			slog.Warn("[Auth] failed to update dev user", "user", devLogin, "error", err)
			return c.Redirect(h.frontendURL+"/login?error=db_error", fiber.StatusTemporaryRedirect)
		}
	}

	// Update last login
	h.store.UpdateLastLogin(user.ID)

	// Generate JWT
	jwtToken, err := h.generateJWT(user)
	if err != nil {
		return c.Redirect(h.frontendURL+"/login?error=jwt_failed", fiber.StatusTemporaryRedirect)
	}

	// Set HttpOnly cookie (primary auth) — the token is NOT passed in the URL
	// to prevent leakage via browser history, Referer headers, and server logs (#4278).
	// The frontend reads the token from the cookie via POST /auth/refresh.
	h.setJWTCookie(c, jwtToken)

	c.Set("Cache-Control", "no-store")
	redirectURL := fmt.Sprintf("%s/auth/callback?onboarded=%t", h.frontendURL, user.Onboarded)
	return c.Redirect(redirectURL, fiber.StatusTemporaryRedirect)
}

// hasValidAuthCookie reports whether the incoming request carries a kc_auth
// cookie that parses as a non-expired, non-revoked JWT under the handler's
// signing secret. It is used by GitHubCallback (#6064) to recover from CSRF
// state-validation failures when the user is already authenticated: a stale
// OAuth tab, a browser back-button replay, or a server restart that cleared
// the in-memory state store should not force a user with a live session
// back through the login flow. Any parse error, validity failure, missing
// claims, or revocation check failure causes this helper to return false so
// the caller falls through to the normal error path.
func (h *AuthHandler) hasValidAuthCookie(c *fiber.Ctx) bool {
	cookieToken := c.Cookies(jwtCookieName)
	if cookieToken == "" {
		return false
	}
	parsed, err := middleware.ParseJWT(cookieToken, h.jwtSecret)
	if err != nil || parsed == nil || !parsed.Valid {
		return false
	}
	claims, ok := parsed.Claims.(*middleware.UserClaims)
	if !ok {
		return false
	}
	if claims.ID != "" && middleware.IsTokenRevoked(claims.ID) {
		return false
	}
	return true
}

// oauthErrorRedirect builds a redirect URL to the login page with a structured error.
// The error code is always present; detail is optional human-readable context.
func (h *AuthHandler) oauthErrorRedirect(c *fiber.Ctx, errorCode, detail string) error {
	q := url.Values{"error": {errorCode}}
	if detail != "" {
		q.Set("error_detail", detail)
	}
	c.Set("Cache-Control", "no-store")
	return c.Redirect(h.frontendURL+"/login?"+q.Encode(), fiber.StatusTemporaryRedirect)
}

// classifyExchangeError inspects a token-exchange error and returns a specific
// error code plus a short description suitable for logging and the frontend.
func classifyExchangeError(err error) (code, detail string) {
	msg := err.Error()

	// Network-level failures (DNS, TCP, TLS)
	var netErr net.Error
	if ok := errors.As(err, &netErr); ok {
		if netErr.Timeout() {
			return "network_error", "Request to GitHub timed out — check your internet connection"
		}
		return "network_error", "Could not reach GitHub — check your internet connection or firewall"
	}

	// oauth2 wraps the HTTP response body when GitHub returns a non-200.
	// Common patterns from GitHub's OAuth error responses:
	lower := strings.ToLower(msg)
	switch {
	case strings.Contains(lower, "incorrect_client_credentials") ||
		strings.Contains(lower, "client_id"):
		return "invalid_client", "GitHub rejected the client credentials — verify GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET"
	case strings.Contains(lower, "redirect_uri_mismatch"):
		return "redirect_mismatch", "The callback URL does not match the one registered in GitHub OAuth app settings"
	case strings.Contains(lower, "bad_verification_code"):
		return "exchange_failed", "Authorization code expired or was already used — please try logging in again"
	default:
		return "exchange_failed", msg
	}
}

// GitHubCallback handles the OAuth callback
func (h *AuthHandler) GitHubCallback(c *fiber.Ctx) error {
	// GitHub may redirect with an error parameter when the user denies access
	// or the OAuth app is misconfigured (e.g., suspended, wrong callback URL).
	if ghError := c.Query("error"); ghError != "" {
		ghDescription := c.Query("error_description", ghError)
		slog.Error("[Auth] GitHub returned error", "error", ghError, "description", ghDescription)
		if ghError == "access_denied" {
			return h.oauthErrorRedirect(c, "access_denied", ghDescription)
		}
		return h.oauthErrorRedirect(c, "github_error", ghDescription)
	}

	code := c.Query("code")
	if code == "" {
		return h.oauthErrorRedirect(c, "missing_code", "")
	}

	// CSRF validation: verify state parameter matches server-side store
	// (Safari blocks cookies in OAuth redirect flows, so we use server-side state)
	state := c.Query("state")
	if state == "" || !h.validateAndConsumeOAuthState(state) {
		// #6064 — State validation can fail for reasons that are entirely
		// benign from the user's perspective: a stale OAuth tab left open
		// from a previous session, a server restart that cleared the
		// in-memory state store (#6028 addresses the root cause by
		// persisting state across restarts), or a duplicate back-button
		// submission. In all of these cases, if the browser is already
		// carrying a valid kc_auth cookie, the user is effectively still
		// signed in — bouncing them to an error page forces a pointless
		// re-login. Instead, when the incoming request carries a non-
		// expired, non-revoked JWT cookie, short-circuit to the frontend
		// root so the existing session is preserved.
		if h.hasValidAuthCookie(c) {
			slog.Info("[Auth] CSRF state invalid but user already has valid cookie, recovering to /")
			c.Set("Cache-Control", "no-store")
			return c.Redirect(h.frontendURL+"/", fiber.StatusTemporaryRedirect)
		}
		slog.Error("[Auth] CSRF validation failed: invalid or expired state token")
		return h.oauthErrorRedirect(c, "csrf_validation_failed", "")
	}

	// Exchange code for token — use a context with timeout for resilience
	ctx, cancel := context.WithTimeout(context.Background(), githubHTTPTimeout)
	defer cancel()
	token, err := h.oauthConfig.Exchange(ctx, code)
	if err != nil {
		errCode, detail := classifyExchangeError(err)
		slog.Error("[Auth] token exchange failed", "code", errCode, "error", err)
		return h.oauthErrorRedirect(c, errCode, detail)
	}

	// Get user info from GitHub
	ghUser, err := h.getGitHubUser(token.AccessToken)
	if err != nil {
		slog.Error("[Auth] failed to get GitHub user", "error", err)
		detail := err.Error()
		return h.oauthErrorRedirect(c, "user_fetch_failed", detail)
	}

	// Find or create user
	user, err := h.store.GetUserByGitHubID(fmt.Sprintf("%d", ghUser.ID))
	if err != nil {
		slog.Error("[Auth] database error getting user", "error", err)
		return h.oauthErrorRedirect(c, "db_error", "")
	}

	if user == nil {
		// Create new user
		user = &models.User{
			GitHubID:    fmt.Sprintf("%d", ghUser.ID),
			GitHubLogin: ghUser.Login,
			Email:       ghUser.Email,
			AvatarURL:   ghUser.AvatarURL,
			Onboarded:   h.skipOnboarding, // Skip questionnaire if SKIP_ONBOARDING=true
		}
		if err := h.store.CreateUser(user); err != nil {
			slog.Error("[Auth] failed to create user", "error", err)
			return h.oauthErrorRedirect(c, "create_user_failed", "")
		}
	} else {
		// Update user info
		user.GitHubLogin = ghUser.Login
		user.Email = ghUser.Email
		user.AvatarURL = ghUser.AvatarURL
		if err := h.store.UpdateUser(user); err != nil {
			slog.Warn("[Auth] failed to update user", "user", ghUser.Login, "error", err)
			return h.oauthErrorRedirect(c, "db_error", "")
		}
	}

	// Update last login
	h.store.UpdateLastLogin(user.ID)

	// Generate JWT
	jwtToken, err := h.generateJWT(user)
	if err != nil {
		slog.Error("[Auth] JWT generation failed", "error", err)
		return h.oauthErrorRedirect(c, "jwt_failed", "")
	}

	// Set HttpOnly cookie (primary auth) — the token is NOT passed in the URL
	// to prevent leakage via browser history, Referer headers, and server logs (#4278).
	// The frontend reads the token from the cookie via POST /auth/refresh.
	h.setJWTCookie(c, jwtToken)

	c.Set("Cache-Control", "no-store")
	redirectURL := fmt.Sprintf("%s/auth/callback?onboarded=%t", h.frontendURL, user.Onboarded)
	return c.Redirect(redirectURL, fiber.StatusTemporaryRedirect)
}

// Logout revokes the current JWT so it can no longer be used.
// The token's jti is added to an in-memory revocation list that is
// checked by the JWTAuth middleware on every request.
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// Accept token from Authorization header or HttpOnly cookie
	var tokenString string
	authHeader := c.Get("Authorization")
	if len(authHeader) >= bearerPrefixLen && strings.HasPrefix(authHeader, bearerPrefix) {
		tokenString = authHeader[bearerPrefixLen:]
	}
	if tokenString == "" {
		tokenString = c.Cookies(jwtCookieName)
	}
	if tokenString == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "Missing authorization")
	}
	token, err := middleware.ParseJWT(tokenString, h.jwtSecret)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
	}

	claims, ok := token.Claims.(*middleware.UserClaims)
	if !ok || claims.ID == "" {
		return fiber.NewError(fiber.StatusBadRequest, "Token has no revocable identifier")
	}

	// Add to revocation list — expires when the JWT itself would expire
	expiresAt := time.Now().Add(jwtExpiration) // fallback
	if claims.ExpiresAt != nil {
		expiresAt = claims.ExpiresAt.Time
	}
	middleware.RevokeToken(claims.ID, expiresAt)

	// Clear the HttpOnly cookie so the browser stops sending it
	h.clearJWTCookie(c)

	// Disconnect all active WebSocket connections for this user (#4906).
	// This ensures that already-established WebSocket sessions cannot continue
	// to receive data after the token is revoked.
	if h.wsHub != nil && claims.UserID != uuid.Nil {
		h.wsHub.DisconnectUser(claims.UserID)
	}

	// Cancel any active /ws/exec sessions for this user (#6024). Exec
	// sessions are not tracked by the WebSocket Hub — they run their own
	// read loop against executor.StreamWithContext — so Hub.DisconnectUser
	// cannot reach them. The exec handler registers its stream cancel func
	// in a per-user registry on session start; cancelling those funcs here
	// unblocks the stream and tears the connection down promptly.
	if claims.UserID != uuid.Nil {
		CancelUserExecSessions(claims.UserID)
		// Cancel any active SSE streams for this user (#6029). SSE streams
		// run inside SetBodyStreamWriter callbacks that block for up to
		// sseOverallDeadline (~30s); without this, a logged-out user would
		// continue to receive cluster_data events until the deadline fires.
		// streamClusters registers each stream's cancel func in a per-user
		// registry on start; cancelling those funcs here ends the stream.
		CancelUserSSEStreams(claims.UserID)
	}

	slog.Info("[Auth] token revoked, WS sessions closed", "user", claims.GitHubLogin, "jti", claims.ID)
	return c.JSON(fiber.Map{"success": true, "message": "Token revoked"})
}

// RefreshToken refreshes the JWT token.
// Token resolution order: Authorization header -> HttpOnly cookie.
// The cookie fallback is required for the OAuth callback flow where the
// frontend has no token in localStorage yet — it was set as an HttpOnly
// cookie by the backend redirect (#4278).
func (h *AuthHandler) RefreshToken(c *fiber.Ctx) error {
	var tokenString string

	// Prefer Authorization header (existing callers send this)
	authHeader := c.Get("Authorization")
	if authHeader != "" {
		if len(authHeader) < bearerPrefixLen || !strings.HasPrefix(authHeader, bearerPrefix) {
			return fiber.NewError(fiber.StatusUnauthorized, "Invalid authorization format")
		}
		tokenString = authHeader[bearerPrefixLen:]
	}

	// Fallback: read from HttpOnly cookie (OAuth callback flow)
	if tokenString == "" {
		tokenString = c.Cookies(jwtCookieName)
	}

	if tokenString == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "Missing authorization")
	}
	token, err := middleware.ParseJWT(tokenString, h.jwtSecret)
	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
	}

	claims, ok := token.Claims.(*middleware.UserClaims)
	if !ok {
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid claims")
	}

	// Revoke the old token to prevent reuse
	if claims.ID != "" {
		expiresAt := time.Now().Add(jwtExpiration)
		if claims.ExpiresAt != nil {
			expiresAt = claims.ExpiresAt.Time
		}
		middleware.RevokeToken(claims.ID, expiresAt)
	}

	// Get fresh user data
	user, err := h.store.GetUser(claims.UserID)
	if err != nil || user == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User not found")
	}

	// Generate new token
	newToken, err := h.generateJWT(user)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to generate token")
	}

	// Update HttpOnly cookie with the fresh token
	h.setJWTCookie(c, newToken)

	return c.JSON(fiber.Map{
		"token":     newToken,
		"onboarded": user.Onboarded,
	})
}

// GitHubUser represents a GitHub user
type GitHubUser struct {
	ID        int    `json:"id"`
	Login     string `json:"login"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

func (h *AuthHandler) getGitHubUser(accessToken string) (*GitHubUser, error) {
	req, err := http.NewRequest("GET", h.githubAPIBase+"/user", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: githubHTTPTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned %d", resp.StatusCode)
	}

	var user GitHubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, err
	}

	// GET /user only returns the user's public email (empty if not set).
	// Fall back to GET /user/emails (requires user:email scope) to find
	// the primary verified email address.
	if user.Email == "" {
		if email, err := h.getGitHubPrimaryEmail(accessToken); err == nil {
			user.Email = email
		}
	}

	return &user, nil
}

// gitHubEmail represents one entry from GitHub's GET /user/emails response.
type gitHubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

// getGitHubPrimaryEmail fetches the user's primary verified email via
// GET /user/emails (requires the user:email OAuth scope).
func (h *AuthHandler) getGitHubPrimaryEmail(accessToken string) (string, error) {
	req, err := http.NewRequest("GET", h.githubAPIBase+"/user/emails", nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: githubHTTPTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub emails API returned %d", resp.StatusCode)
	}

	var emails []gitHubEmail
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}

	// Return the primary verified email; fall back to first verified email.
	var firstVerified string
	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
		if e.Verified && firstVerified == "" {
			firstVerified = e.Email
		}
	}

	if firstVerified != "" {
		return firstVerified, nil
	}

	return "", fmt.Errorf("no verified email found")
}

// setJWTCookie sets an HttpOnly cookie carrying the JWT token.
// The cookie is Secure when the frontend URL uses HTTPS, SameSite=Lax
// to allow top-level navigations (OAuth redirects) while blocking
// cross-site POST requests.
func (h *AuthHandler) setJWTCookie(c *fiber.Ctx, token string) {
	secure := strings.HasPrefix(h.frontendURL, "https://")
	c.Cookie(&fiber.Cookie{
		Name:     jwtCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(jwtExpiration.Seconds()),
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Lax",
	})
}

// clearJWTCookie removes the JWT HttpOnly cookie.
func (h *AuthHandler) clearJWTCookie(c *fiber.Ctx) {
	secure := strings.HasPrefix(h.frontendURL, "https://")
	c.Cookie(&fiber.Cookie{
		Name:     jwtCookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HTTPOnly: true,
		Secure:   secure,
		SameSite: "Lax",
	})
}

func (h *AuthHandler) generateJWT(user *models.User) (string, error) {
	claims := middleware.UserClaims{
		UserID:      user.ID,
		GitHubLogin: user.GitHubLogin,
		RegisteredClaims: jwt.RegisteredClaims{
			ID:        uuid.New().String(), // jti — unique token identifier for revocation
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(jwtExpiration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}
