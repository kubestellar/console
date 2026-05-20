package handlers

import (
	"context"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
	"golang.org/x/oauth2"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// bearerPrefix is the standard "Bearer " prefix in Authorization headers.
const bearerPrefix = "Bearer "

// bearerPrefixLen is the length of the "Bearer " prefix (7 bytes).
// Used to safely slice Authorization headers after validating the prefix.
const bearerPrefixLen = len(bearerPrefix)

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
	// githubHTTPClient is a shared HTTP client for GitHub API calls (#6582).
	// Previously getGitHubUser / getGitHubPrimaryEmail created a new
	// http.Client per call, defeating connection reuse and leaking idle
	// TCP connections during bursts of OAuth callbacks.
	githubHTTPClient *http.Client
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
		githubAPIBase:    apiBase,
		jwtSecret:        cfg.JWTSecret,
		frontendURL:      cfg.FrontendURL,
		devUserLogin:     cfg.DevUserLogin,
		devUserEmail:     cfg.DevUserEmail,
		devUserAvatar:    cfg.DevUserAvatar,
		githubToken:      cfg.GitHubToken,
		devMode:          cfg.DevMode,
		skipOnboarding:   cfg.SkipOnboarding,
		cleanupCtx:       cleanupCtx,
		cleanupCancel:    cleanupCancel,
		githubHTTPClient: client.GitHub,
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
		safego.GoWith("auth/oauth-state-cleanup", func() { h.runOAuthStateCleanup() })
	}

	return h
}

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
	if err := h.storeOAuthState(c.UserContext(), state); err != nil {
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
		ghUser, err := h.getGitHubUser(c.UserContext(), h.githubToken)
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
	user, err := h.store.GetUserByGitHubID(c.UserContext(), devGitHubID)
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
		// Create dev user with admin role — dev mode is for testing and
		// the dev user needs full access to exercise all features (e.g.
		// self-upgrade trigger, settings, RBAC management).
		user = &models.User{
			GitHubID:    devGitHubID,
			GitHubLogin: devLogin,
			Email:       devEmail,
			AvatarURL:   avatarURL,
			Role:        models.UserRoleAdmin,
			Onboarded:   true, // Skip onboarding in dev mode
		}
		if err := h.store.CreateUser(c.UserContext(), user); err != nil {
			return c.Redirect(h.frontendURL+"/login?error=create_user_failed", fiber.StatusTemporaryRedirect)
		}
	} else {
		// Update existing user info to match config.
		// Ensure dev-mode user always has admin role so all features
		// (self-upgrade, settings, RBAC) are exercisable during testing.
		user.GitHubLogin = devLogin
		user.Email = devEmail
		user.AvatarURL = avatarURL
		user.Role = models.UserRoleAdmin
		if err := h.store.UpdateUser(c.UserContext(), user); err != nil {
			slog.Warn("[Auth] failed to update dev user", "user", devLogin, "error", err)
			return c.Redirect(h.frontendURL+"/login?error=db_error", fiber.StatusTemporaryRedirect)
		}
	}

	// Update last login. Failures here are non-fatal — login should succeed
	// even if the last-login timestamp can't be written.
	if err := h.store.UpdateLastLogin(c.UserContext(), user.ID); err != nil {
		slog.Warn("[Auth] failed to update last-login timestamp (devMode)",
			"user", user.ID, "error", err)
	}

	// Generate JWT
	jwtToken, err := h.generateJWT(user)
	if err != nil {
		return c.Redirect(h.frontendURL+"/login?error=jwt_failed", fiber.StatusTemporaryRedirect)
	}

	// Set HttpOnly cookie (primary auth) — the token is NOT passed in the URL
	// to prevent leakage via browser history, Referer headers, and server logs (#4278).
	// The frontend reads the token from the cookie via POST /auth/refresh.
	h.setJWTCookie(c, jwtToken)
	audit.Log(c, audit.ActionUserLogin, "user", user.ID.String(), user.GitHubLogin)

	c.Set("Cache-Control", "no-store")
	redirectURL := fmt.Sprintf("%s/auth/callback?onboarded=%t", h.frontendURL, user.Onboarded)
	return c.Redirect(redirectURL, fiber.StatusTemporaryRedirect)
}

// GitHubCallback handles the OAuth callback
func (h *AuthHandler) GitHubCallback(c *fiber.Ctx) error {
	slog.Info("[Auth] GitHubCallback entered",
		"hasCode", c.Query("code") != "",
		"hasState", c.Query("state") != "",
		"hasError", c.Query("error") != "",
		"redirectURI", h.oauthConfig.RedirectURL,
		"frontendURL", h.frontendURL)

	// GitHub may redirect with an error parameter when the user denies access
	// or the OAuth app is misconfigured (e.g., suspended, wrong callback URL).
	if ghError := c.Query("error"); ghError != "" {
		// #6583 — sanitize error_description before reflecting it into a
		// user-visible URL. GitHub's value is attacker-influenceable.
		rawDescription := c.Query("error_description", ghError)
		ghDescription := sanitizeOAuthErrorDescription(rawDescription)
		if ghDescription == "" {
			ghDescription = sanitizeOAuthErrorDescription(ghError)
		}
		slog.Error("[Auth] GitHub returned error",
			"error", ghError, "description", ghDescription)
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
	if state == "" || !h.validateAndConsumeOAuthState(c.UserContext(), state) {
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

	// Exchange code for token — use a context with timeout derived from the
	// request context so that a client disconnect cancels the in-flight
	// OAuth exchange instead of leaking the goroutine until timeout.
	ctx, cancel := context.WithTimeout(c.UserContext(), githubHTTPTimeout)
	defer cancel()
	slog.Info("[Auth] exchanging code with GitHub", "codeLen", len(code), "tokenURL", h.oauthConfig.Endpoint.TokenURL)
	token, err := h.oauthConfig.Exchange(ctx, code)
	if err != nil {
		errCode, detail := classifyExchangeError(err)
		clientIDPrefix := ""
		if h.oauthConfig.ClientID != "" {
			clientIDPrefix = h.oauthConfig.ClientID[:min(8, len(h.oauthConfig.ClientID))] + "..."
		}
		slog.Error("[Auth] token exchange failed", "code", errCode, "error", err, "detail", detail,
			"clientID_prefix", clientIDPrefix)
		return h.oauthErrorRedirect(c, errCode, detail)
	}

	// Get user info from GitHub
	ghUser, err := h.getGitHubUser(c.UserContext(), token.AccessToken)
	if err != nil {
		slog.Error("[Auth] failed to get GitHub user", "error", err)
		return h.oauthErrorRedirect(c, "user_fetch_failed", "Failed to retrieve GitHub user profile")
	}

	// Find or create user
	user, err := h.store.GetUserByGitHubID(c.UserContext(), fmt.Sprintf("%d", ghUser.ID))
	if err != nil {
		slog.Error("[Auth] database error getting user", "error", err)
		return h.oauthErrorRedirect(c, "db_error", "")
	}
	bootstrapAdmin, err := shouldBootstrapAdmin(c.UserContext(), h.store)
	if err != nil {
		slog.Error("[Auth] failed to count admin users", "error", err)
		return h.oauthErrorRedirect(c, "db_error", "")
	}

	if user == nil {
		role := models.UserRoleViewer
		if bootstrapAdmin {
			role = models.UserRoleAdmin
		}
		// Create new user
		user = &models.User{
			GitHubID:    fmt.Sprintf("%d", ghUser.ID),
			GitHubLogin: ghUser.Login,
			Email:       ghUser.Email,
			AvatarURL:   ghUser.AvatarURL,
			Role:        role,
			Onboarded:   h.skipOnboarding, // Skip questionnaire if SKIP_ONBOARDING=true
		}
		if err := h.store.CreateUser(c.UserContext(), user); err != nil {
			slog.Error("[Auth] failed to create user", "error", err)
			return h.oauthErrorRedirect(c, "create_user_failed", "")
		}
	} else {
		// Update user info
		user.GitHubLogin = ghUser.Login
		user.Email = ghUser.Email
		user.AvatarURL = ghUser.AvatarURL
		if bootstrapAdmin {
			user.Role = models.UserRoleAdmin
		}
		if err := h.store.UpdateUser(c.UserContext(), user); err != nil {
			slog.Warn("[Auth] failed to update user", "user", ghUser.Login, "error", err)
			return h.oauthErrorRedirect(c, "db_error", "")
		}
	}

	h.maybePromoteLocalBootstrapAdmin(c.UserContext(), user)

	// Update last login. Failures here are non-fatal — login should succeed
	// even if the last-login timestamp can't be persisted.
	if err := h.store.UpdateLastLogin(c.UserContext(), user.ID); err != nil {
		slog.Warn("[Auth] failed to update last-login timestamp (oauth)",
			"user", user.ID, "error", err)
	}

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
	audit.Log(c, audit.ActionUserLogin, "user", user.ID.String(), user.GitHubLogin)
	slog.Info("[Auth] OAuth callback complete", "user", user.GitHubLogin, "frontendURL", h.frontendURL)

	c.Set("Cache-Control", "no-store")
	// The GitHub access credential is handed off to the frontend in the
	// URL fragment, not a query param: fragments are not sent to servers
	// or logged in Referer headers. The frontend moves it into session
	// storage (obfuscated) and strips the fragment on arrival. The
	// param name is intentionally opaque — keep it that way.
	redirectURL := fmt.Sprintf("%s/auth/callback?onboarded=%t#kc_x=%s",
		h.frontendURL, user.Onboarded, url.QueryEscape(token.AccessToken))
	return c.Redirect(redirectURL, fiber.StatusTemporaryRedirect)
}

// Logout revokes the current JWT so it can no longer be used.
// The token's jti is added to the persistent revocation store which is
// checked by the JWTAuth middleware on every request.
//
// Security properties (#6580, #6587, #6588):
//   - Requires the X-Requested-With: XMLHttpRequest header as a CSRF gate;
//     browsers will not send this header on cross-origin form POSTs even
//     with SameSite=Lax cookies, so a malicious site cannot trigger a
//     drive-by logout.
//   - Uses middleware.ValidateJWT (not ParseJWT) so expired/invalid tokens
//     are rejected without being added to the revocation list. Adding
//     already-expired JTIs would bloat the revocation store for zero
//     security benefit.
//   - The /auth/logout route is registered with h.JWTAuth middleware in
//     server.go (#6587), which additionally enforces the revocation check.
func (h *AuthHandler) Logout(c *fiber.Ctx) error {
	// CSRF protection is enforced by the RequireCSRF middleware in server.go.

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

	// #6580 — use ValidateJWT (expiry + signature + revocation) instead of
	// ParseJWT. An expired or otherwise invalid token is rejected outright,
	// and the frontend is told to just clear its cookie idempotently. We do
	// NOT add expired JTIs to the revocation store because they are already
	// unusable and would only bloat the persistent table.
	claims, err := middleware.ValidateJWT(tokenString, h.jwtSecret)
	if err != nil {
		// Treat expired / invalid tokens as an idempotent success: the
		// caller already has nothing usable, so clearing the cookie is a
		// no-op from a security standpoint. Return 200 so the frontend
		// unconditionally proceeds to the logged-out state.
		slog.Info("[Auth] logout with expired/invalid token — clearing cookie idempotently",
			"error", err)
		h.clearJWTCookie(c)
		return c.JSON(fiber.Map{"success": true, "message": "Already logged out"})
	}

	if claims.ID == "" {
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

	// Cancel any active SSE streams for this user (#6029). SSE streams
	// run inside SetBodyStreamWriter callbacks that block for up to
	// sseOverallDeadline (~30s); without this, a logged-out user would
	// continue to receive cluster_data events until the deadline fires.
	// streamClusters registers each stream's cancel func in a per-user
	// registry on start; cancelling those funcs here ends the stream.
	//
	// /ws/exec was previously cancelled here via CancelUserExecSessions
	// (#6024), but Phase 3d of #7993 moved the exec WebSocket to kc-agent
	// — it's a per-user local process that goes away when the browser tab
	// closes, so there's no cross-session state that Logout needs to tear
	// down. #5406 is closed as part of the same migration.
	if claims.UserID != uuid.Nil {
		CancelUserSSEStreams(claims.UserID)
	}

	audit.Log(c, audit.ActionUserLogout, "user", claims.UserID.String(), claims.GitHubLogin)
	slog.Info("[Auth] token revoked, WS sessions closed", "user", claims.GitHubLogin, "jti", claims.ID)
	return c.JSON(fiber.Map{"success": true, "message": "Token revoked"})
}

// RefreshToken refreshes the JWT token.
// Token resolution order: Authorization header -> HttpOnly cookie.
// The cookie fallback is required for the OAuth callback flow where the
// frontend has no token in localStorage yet — it was set as an HttpOnly
// cookie by the backend redirect (#4278).
//
// Security properties (#6579, #6588, #6590):
//   - Requires the X-Requested-With: XMLHttpRequest header as a CSRF gate.
//   - Uses ValidateJWT which performs expiry + signature + revocation
//     checks (#6579): previously RefreshToken accepted revoked tokens
//     because it used ParseJWT, defeating server-side logout for any
//     client that could just refresh itself.
//   - Returns the new JWT ONLY via the HttpOnly cookie. The JSON body
//     no longer contains the token (#6590) so JavaScript cannot read it,
//     preserving the intent of HttpOnly.
func (h *AuthHandler) RefreshToken(c *fiber.Ctx) error {
	// CSRF protection is enforced by the RequireCSRF middleware in server.go.

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

	// #6579 — ValidateJWT includes the revocation check. Previously this
	// endpoint used ParseJWT and skipped revocation, so a revoked token
	// could be refreshed into a fresh valid token, silently defeating
	// server-side logout.
	claims, err := middleware.ValidateJWT(tokenString, h.jwtSecret)
	if err != nil {
		slog.Info("[Auth] refresh rejected: invalid or revoked token", "error", err)
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
	}

	// Revoke the old token to prevent reuse of the old JTI after refresh.
	if claims.ID != "" {
		expiresAt := time.Now().Add(jwtExpiration)
		if claims.ExpiresAt != nil {
			expiresAt = claims.ExpiresAt.Time
		}
		middleware.RevokeToken(claims.ID, expiresAt)
	}

	// Get fresh user data
	user, err := h.store.GetUser(c.UserContext(), claims.UserID)
	if err != nil || user == nil {
		return fiber.NewError(fiber.StatusUnauthorized, "User not found")
	}

	// Generate new token
	newToken, err := h.generateJWT(user)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to generate token")
	}

	// Update HttpOnly cookie with the fresh token. The token is delivered
	// EXCLUSIVELY via the HttpOnly kc_auth cookie (#6590) so JavaScript can
	// never read it. Returning the token in the JSON body would defeat the
	// purpose of HttpOnly: any XSS or browser-extension content script could
	// scrape it from `fetch().then(r => r.json())`. The cookie is enough —
	// JWTAuth middleware reads kc_auth on every subsequent API request, and
	// the stale-bearer-fallback path (#6026) handles in-flight requests that
	// still carry the previous token in their Authorization header.
	h.setJWTCookie(c, newToken)

	return c.JSON(fiber.Map{
		"refreshed": true,
		"onboarded": user.Onboarded,
	})
}
