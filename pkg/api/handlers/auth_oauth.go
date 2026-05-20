package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/api/middleware"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

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
	// localBootstrapAdminUserCount is the maximum number of known users allowed
	// when auto-promoting the first localhost user to admin.
	localBootstrapAdminUserCount = 1
)

// storeOAuthState persists an OAuth CSRF state token in the backing store.
//
// Previously this lived in an in-process map, which meant a backend restart
// between /auth/login and /auth/callback would drop every in-flight OAuth
// flow and surface as `csrf_validation_failed` to users (issue #6028). The
// persistent store makes OAuth flows resilient across restarts, as long as
// the user completes the flow within oauthStateExpiration.
func (h *AuthHandler) storeOAuthState(ctx context.Context, state string) error {
	return h.store.StoreOAuthState(ctx, state, oauthStateExpiration)
}

// validateAndConsumeOAuthState atomically looks up and deletes an OAuth state
// token. Returns true only when the state was found, had not expired, and was
// successfully consumed (single-use). Returns false on any error or miss so
// callers can respond with a generic csrf_validation_failed without leaking
// details.
// #6613: pass the request context so a browser disconnect or callback
// deadline aborts the BEGIN IMMEDIATE transaction in the store instead of
// running to completion with a dangling context.Background().
func (h *AuthHandler) validateAndConsumeOAuthState(ctx context.Context, state string) bool {
	ok, err := h.store.ConsumeOAuthState(ctx, state)
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

const (
	// jwtCookieName is the HttpOnly cookie that carries the JWT.
	jwtCookieName = "kc_auth"
	// maxOAuthErrorDescriptionLen bounds the length of an OAuth
	// error_description value reflected into a redirect URL (#6583).
	maxOAuthErrorDescriptionLen = 200
)

// sanitizeOAuthErrorDescription scrubs an externally-supplied OAuth error
// description before it is reflected into a user-visible redirect URL
// (#6583). GitHub's error_description is an attacker-influenceable string
// (malicious OAuth apps could craft arbitrary content, and users could
// forge the value by visiting a hand-crafted callback URL). Unsanitized
// reflection enables:
//   - header injection via embedded CR/LF,
//   - long-URL / log-flooding attacks,
//   - phishing copy injected into the login page.
//
// The sanitizer strips control characters, collapses whitespace, limits
// length to maxOAuthErrorDescriptionLen, and returns only ASCII printable
// plus space. Callers should still HTML-escape at render time.
func sanitizeOAuthErrorDescription(raw string) string {
	if raw == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(raw))
	for _, r := range raw {
		// Allow only printable ASCII plus space. Reject CR, LF, tab, NUL,
		// and anything non-ASCII (which could confuse URL parsers or be
		// used for homograph tricks in error pages).
		if r >= 0x20 && r < 0x7f {
			b.WriteRune(r)
		} else {
			b.WriteRune(' ')
		}
		if b.Len() >= maxOAuthErrorDescriptionLen {
			break
		}
	}
	out := strings.TrimSpace(b.String())
	if len(out) > maxOAuthErrorDescriptionLen {
		out = out[:maxOAuthErrorDescriptionLen]
	}
	return out
}

// oauthErrorRedirect builds a redirect URL to the login page with a structured error.
// The error code is always present; detail is optional human-readable context.
// Any attacker-influenceable detail MUST be passed through
// sanitizeOAuthErrorDescription before reaching this function (#6583).
func (h *AuthHandler) oauthErrorRedirect(c *fiber.Ctx, errorCode, detail string) error {
	// Record auth failure for progressive rate-limit escalation (#8676 Phase 2).
	if tracker, ok := c.Locals("failureTracker").(*middleware.FailureTracker); ok {
		tracker.RecordFailure(c.IP())
	}
	q := url.Values{"error": {errorCode}}
	if detail != "" {
		q.Set("error_detail", detail)
	}
	c.Set("Cache-Control", "no-store")
	return c.Redirect(h.frontendURL+"/login?"+q.Encode(), fiber.StatusTemporaryRedirect)
}

// classifyExchangeError inspects a token-exchange error and returns a specific
// error code plus a short description suitable for logging and the frontend.
// Enhanced in #14850 to provide clearer guidance when OAuth credentials are invalid.
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
		strings.Contains(lower, "client_id") ||
		strings.Contains(lower, "invalid_client"):
		return "invalid_client", "GitHub OAuth failed: invalid client credentials. Verify GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your .env file match your GitHub OAuth App settings at https://github.com/settings/developers"
	case strings.Contains(lower, "redirect_uri_mismatch"):
		return "redirect_mismatch", "The callback URL does not match the one registered in GitHub OAuth app settings. Expected: the callback URL in your .env to match the one at https://github.com/settings/developers"
	case strings.Contains(lower, "bad_verification_code"):
		return "exchange_failed", "Authorization code expired or was already used — please try logging in again"
	default:
		return "exchange_failed", "Token exchange failed — please try logging in again. If this persists, verify your GitHub OAuth App credentials."
	}
}

// GitHubUser represents a GitHub user
type GitHubUser struct {
	ID        int    `json:"id"`
	Login     string `json:"login"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

func (h *AuthHandler) getGitHubUser(ctx context.Context, accessToken string) (*GitHubUser, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", h.githubAPIBase+"/user", nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	// #6582 — reuse the handler-scoped HTTP client rather than creating a
	// fresh one per call. Creating a new client per request defeats
	// connection reuse and leaks idle TCP connections under load.
	resp, err := h.githubHTTPClient.Do(req)
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
		if email, err := h.getGitHubPrimaryEmail(ctx, accessToken); err == nil {
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
func (h *AuthHandler) getGitHubPrimaryEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", h.githubAPIBase+"/user/emails", nil)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	// #6582 — reuse the shared HTTP client (see getGitHubUser above).
	resp, err := h.githubHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub emails API returned %d", resp.StatusCode)
	}

	emails := make([]gitHubEmail, 0)
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
