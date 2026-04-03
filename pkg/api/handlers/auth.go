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
	"sync"
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
	// for expired OAuth state entries.
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

// oauthStateStore stores OAuth state tokens server-side (Safari blocks cookies in OAuth flows)
var oauthStateStore = struct {
	sync.RWMutex
	states map[string]time.Time
}{states: make(map[string]time.Time)}

// init starts a background goroutine that periodically purges expired
// OAuth state entries.  This ensures the map stays bounded even when no
// new OAuth flows are initiated (the inline cleanup in storeOAuthState
// only runs when a new state is added).
func init() {
	go func() {
		ticker := time.NewTicker(oauthStateCleanupInterval)
		defer ticker.Stop()
		for range ticker.C {
			purgeExpiredOAuthStates()
		}
	}()
}

// purgeExpiredOAuthStates removes all state entries older than oauthStateExpiration.
func purgeExpiredOAuthStates() {
	oauthStateStore.Lock()
	defer oauthStateStore.Unlock()
	now := time.Now()
	for s, t := range oauthStateStore.states {
		if now.Sub(t) > oauthStateExpiration {
			delete(oauthStateStore.states, s)
		}
	}
}

// inlineCleanupThreshold is the map size above which storeOAuthState performs
// an inline sweep of expired entries. Below this threshold, the background
// goroutine handles cleanup, avoiding an O(n) scan on every insert.
const inlineCleanupThreshold = 100

func storeOAuthState(state string) {
	oauthStateStore.Lock()
	defer oauthStateStore.Unlock()
	// Inline cleanup only when the map has grown large enough to warrant it.
	// Under normal load (a few concurrent OAuth flows), the background sweep
	// in purgeExpiredOAuthStates handles cleanup on its own.
	if len(oauthStateStore.states) >= inlineCleanupThreshold {
		now := time.Now()
		for s, t := range oauthStateStore.states {
			if now.Sub(t) > oauthStateExpiration {
				delete(oauthStateStore.states, s)
			}
		}
	}
	oauthStateStore.states[state] = time.Now()
}

func validateAndConsumeOAuthState(state string) bool {
	oauthStateStore.Lock()
	defer oauthStateStore.Unlock()
	if t, ok := oauthStateStore.states[state]; ok {
		delete(oauthStateStore.states, state)
		return time.Since(t) < oauthStateExpiration
	}
	return false
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
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(s store.Store, cfg AuthConfig) *AuthHandler {
	// Build OAuth redirect URL - must point to BACKEND callback endpoint
	// GitHub redirects here first, then backend redirects to frontend with JWT
	redirectURL := ""
	if cfg.BackendURL != "" {
		redirectURL = cfg.BackendURL + "/auth/github/callback"
	} else if cfg.FrontendURL != "" {
		// Fallback: derive backend URL from frontend URL (replace port)
		// Frontend: http://localhost:5174 -> Backend: http://localhost:8080
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
		slog.Info(fmt.Sprintf("GitHub Enterprise: OAuth via %s, API via %s", ghURL, apiBase))
	}

	return &AuthHandler{
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
	}
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

	// Store state server-side (Safari blocks cookies in OAuth redirect flows)
	storeOAuthState(state)

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
		h.store.UpdateUser(user)
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
		slog.Error(fmt.Sprintf("[Auth] GitHub returned error: %s — %s", ghError, ghDescription))
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
	if state == "" || !validateAndConsumeOAuthState(state) {
		slog.Error("[Auth] CSRF validation failed: invalid or expired state token")
		return h.oauthErrorRedirect(c, "csrf_validation_failed", "")
	}

	// Exchange code for token — use a context with timeout for resilience
	ctx, cancel := context.WithTimeout(context.Background(), githubHTTPTimeout)
	defer cancel()
	token, err := h.oauthConfig.Exchange(ctx, code)
	if err != nil {
		errCode, detail := classifyExchangeError(err)
		slog.Error(fmt.Sprintf("[Auth] Token exchange failed (%s): %v", errCode, err))
		return h.oauthErrorRedirect(c, errCode, detail)
	}

	// Get user info from GitHub
	ghUser, err := h.getGitHubUser(token.AccessToken)
	if err != nil {
		slog.Error(fmt.Sprintf("[Auth] Failed to get GitHub user: %v", err))
		detail := err.Error()
		return h.oauthErrorRedirect(c, "user_fetch_failed", detail)
	}

	// Find or create user
	user, err := h.store.GetUserByGitHubID(fmt.Sprintf("%d", ghUser.ID))
	if err != nil {
		slog.Error(fmt.Sprintf("[Auth] Database error getting user: %v", err))
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
			slog.Error(fmt.Sprintf("[Auth] Failed to create user: %v", err))
			return h.oauthErrorRedirect(c, "create_user_failed", "")
		}
	} else {
		// Update user info
		user.GitHubLogin = ghUser.Login
		user.Email = ghUser.Email
		user.AvatarURL = ghUser.AvatarURL
		h.store.UpdateUser(user)
	}

	// Update last login
	h.store.UpdateLastLogin(user.ID)

	// Generate JWT
	jwtToken, err := h.generateJWT(user)
	if err != nil {
		slog.Error(fmt.Sprintf("[Auth] JWT generation failed: %v", err))
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

	slog.Info(fmt.Sprintf("[Auth] Token revoked for user %s (jti: %s)", claims.GitHubLogin, claims.ID))
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
