package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/models"
	"github.com/kubestellar/console/pkg/store"
)

// AuthConfig holds authentication configuration
type AuthConfig struct {
	GitHubClientID   string
	GitHubSecret     string
	JWTSecret        string
	FrontendURL      string
	DevUserLogin     string
	DevUserEmail     string
	DevUserAvatar    string
	GitHubToken      string // Personal access token for dev mode profile lookup
	DevMode          bool   // Force dev mode bypass even if OAuth credentials present
}

// AuthHandler handles authentication
type AuthHandler struct {
	store         store.Store
	oauthConfig   *oauth2.Config
	jwtSecret     string
	frontendURL   string
	devUserLogin  string
	devUserEmail  string
	devUserAvatar string
	githubToken   string
	devMode       bool
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(s store.Store, cfg AuthConfig) *AuthHandler {
	// Build OAuth redirect URL from frontend URL
	redirectURL := ""
	if cfg.FrontendURL != "" {
		redirectURL = cfg.FrontendURL + "/auth/github/callback"
	}

	return &AuthHandler{
		store: s,
		oauthConfig: &oauth2.Config{
			ClientID:     cfg.GitHubClientID,
			ClientSecret: cfg.GitHubSecret,
			RedirectURL:  redirectURL,
			Scopes:       []string{"user:email", "read:user"},
			Endpoint:     github.Endpoint,
		},
		jwtSecret:     cfg.JWTSecret,
		frontendURL:   cfg.FrontendURL,
		devUserLogin:  cfg.DevUserLogin,
		devUserEmail:  cfg.DevUserEmail,
		devUserAvatar: cfg.DevUserAvatar,
		githubToken:   cfg.GitHubToken,
		devMode:       cfg.DevMode,
	}
}

// GitHubLogin initiates GitHub OAuth flow
func (h *AuthHandler) GitHubLogin(c *fiber.Ctx) error {
	// Dev mode: bypass GitHub OAuth if dev mode is enabled or no client ID configured
	if h.devMode || h.oauthConfig.ClientID == "" {
		return h.devModeLogin(c)
	}

	state := uuid.New().String()
	// In production, store state in session/cookie for CSRF protection
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

	// Exchange code for token
	token, err := h.oauthConfig.Exchange(context.Background(), code)
	if err != nil {
		return c.Redirect(h.frontendURL+"/login?error=exchange_failed", fiber.StatusTemporaryRedirect)
	}

	// Get user info from GitHub
	ghUser, err := h.getGitHubUser(token.AccessToken)
	if err != nil {
		return c.Redirect(h.frontendURL+"/login?error=user_fetch_failed", fiber.StatusTemporaryRedirect)
	}

	// Find or create user
	user, err := h.store.GetUserByGitHubID(fmt.Sprintf("%d", ghUser.ID))
	if err != nil {
		return c.Redirect(h.frontendURL+"/login?error=db_error", fiber.StatusTemporaryRedirect)
	}

	if user == nil {
		// Create new user
		user = &models.User{
			GitHubID:    fmt.Sprintf("%d", ghUser.ID),
			GitHubLogin: ghUser.Login,
			Email:       ghUser.Email,
			AvatarURL:   ghUser.AvatarURL,
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
	req, err := http.NewRequest("GET", "https://api.github.com/user", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	client := &http.Client{Timeout: 10 * time.Second}
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
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Subject:   user.ID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.jwtSecret))
}
