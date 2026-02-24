package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"strings"

	"golang.org/x/oauth2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

const (
	// oauthStateExpiration is how long an OAuth state token remains valid.
	oauthStateExpiration = 10 * time.Minute
	// jwtExpiration is the lifetime of issued JWT tokens.
	jwtExpiration = 24 * time.Hour
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

func storeOAuthState(state string) {
	oauthStateStore.Lock()
	defer oauthStateStore.Unlock()
	// Clean up expired states (older than 10 minutes)
	now := time.Now()
	for s, t := range oauthStateStore.states {
		if now.Sub(t) > oauthStateExpiration {
			delete(oauthStateStore.states, s)
		}
	}
	oauthStateStore.states[state] = now
}

func validateAndConsumeOAuthState(state string) bool {
	oauthStateStore.Lock()
	defer oauthStateStore.Unlock()
	if t, ok := oauthStateStore.states[state]; ok {
		delete(oauthStateStore.states, state)
		// Valid if less than 10 minutes old
		return time.Since(t) < oauthStateExpiration
	}
	return false
}

// AuthConfig holds authentication configuration
type AuthConfig struct {
	GitHubClientID   string
	GitHubSecret     string
	GitHubURL        string // Base GitHub URL (e.g., "https://github.ibm.com"), defaults to "https://github.com"
	JWTSecret        string
	FrontendURL      string
	BackendURL       string // Backend URL for OAuth callback (defaults to http://localhost:8080)
	DevUserLogin     string
	DevUserEmail     string
	DevUserAvatar    string
	GitHubToken      string // Personal access token for dev mode profile lookup
	DevMode          bool   // Force dev mode bypass even if OAuth credentials present
	SkipOnboarding   bool   // Skip onboarding questionnaire for new users
}

// AuthHandler handles authentication
type AuthHandler struct {
	store         store.Store
	oauthConfig   *oauth2.Config
	githubAPIBase string // API base URL: "https://api.github.com" or "https://github.ibm.com/api/v3"
	jwtSecret     string
	frontendURL   string
	devUserLogin  string
	devUserEmail  string
	devUserAvatar string
	githubToken      string
	devMode          bool
	skipOnboarding   bool
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
		log.Printf("GitHub Enterprise: OAuth via %s, API via %s", ghURL, apiBase)
	}

	return &AuthHandler{
		store: s,
		oauthConfig: &oauth2.Config{
			ClientID:     cfg.GitHubClientID,
			ClientSecret: cfg.GitHubSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"user:email", "read:user", "public_repo"},
			Endpoint:     oauthEndpoint,
		},
		githubAPIBase: apiBase,
		jwtSecret:     cfg.JWTSecret,
		frontendURL:   cfg.FrontendURL,
		devUserLogin:  cfg.DevUserLogin,
		devUserEmail:  cfg.DevUserEmail,
		devUserAvatar: cfg.DevUserAvatar,
		githubToken:      cfg.GitHubToken,
		devMode:          cfg.DevMode,
		skipOnboarding:   cfg.SkipOnboarding,
	}
}

const (
	// OAuth state cookie name
	oauthStateCookieName = "oauth_state"
	// OAuth state cookie max age (10 minutes)
	oauthStateCookieMaxAge = 600
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

	// Redirect to frontend with token
	redirectURL := fmt.Sprintf("%s/auth/callback?token=%s&onboarded=%t", h.frontendURL, jwtToken, user.Onboarded)
	return c.Redirect(redirectURL, fiber.StatusTemporaryRedirect)
}

// GitHubCallback handles the OAuth callback
func (h *AuthHandler) GitHubCallback(c *fiber.Ctx) error {
	code := c.Query("code")
	if code == "" {
		return c.Redirect(h.frontendURL+"/login?error=missing_code", fiber.StatusTemporaryRedirect)
	}

	// CSRF validation: verify state parameter matches server-side store
	// (Safari blocks cookies in OAuth redirect flows, so we use server-side state)
	state := c.Query("state")
	if state == "" || !validateAndConsumeOAuthState(state) {
		log.Printf("[Auth] CSRF validation failed: invalid or expired state token")
		return c.Redirect(h.frontendURL+"/login?error=csrf_validation_failed", fiber.StatusTemporaryRedirect)
	}

	// Exchange code for token
	token, err := h.oauthConfig.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("[Auth] Token exchange failed: %v", err)
		return c.Redirect(h.frontendURL+"/login?error=exchange_failed", fiber.StatusTemporaryRedirect)
	}

	// Get user info from GitHub
	ghUser, err := h.getGitHubUser(token.AccessToken)
	if err != nil {
		log.Printf("[Auth] Failed to get GitHub user: %v", err)
		return c.Redirect(h.frontendURL+"/login?error=user_fetch_failed", fiber.StatusTemporaryRedirect)
	}

	// Find or create user
	user, err := h.store.GetUserByGitHubID(fmt.Sprintf("%d", ghUser.ID))
	if err != nil {
		log.Printf("[Auth] Database error getting user: %v", err)
		return c.Redirect(h.frontendURL+"/login?error=db_error", fiber.StatusTemporaryRedirect)
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
			return c.Redirect(h.frontendURL+"/login?error=create_user_failed", fiber.StatusTemporaryRedirect)
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
		return c.Redirect(h.frontendURL+"/login?error=jwt_failed", fiber.StatusTemporaryRedirect)
	}

	// Redirect to frontend with token
	redirectURL := fmt.Sprintf("%s/auth/callback?token=%s&onboarded=%t", h.frontendURL, jwtToken, user.Onboarded)
	return c.Redirect(redirectURL, fiber.StatusTemporaryRedirect)
}

// RefreshToken refreshes the JWT token
func (h *AuthHandler) RefreshToken(c *fiber.Ctx) error {
	// Get current user from context
	authHeader := c.Get("Authorization")
	if authHeader == "" {
		return fiber.NewError(fiber.StatusUnauthorized, "Missing authorization")
	}

	tokenString := authHeader[7:] // Remove "Bearer "
	token, err := jwt.ParseWithClaims(tokenString, &middleware.UserClaims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(h.jwtSecret), nil
	})

	if err != nil {
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid token")
	}

	claims, ok := token.Claims.(*middleware.UserClaims)
	if !ok {
		return fiber.NewError(fiber.StatusUnauthorized, "Invalid claims")
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

	return &user, nil
}

func (h *AuthHandler) generateJWT(user *models.User) (string, error) {
	claims := middleware.UserClaims{
		UserID:      user.ID,
		GitHubLogin: user.GitHubLogin,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(jwtExpiration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}
