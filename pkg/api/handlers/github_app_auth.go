// GitHub App authentication for the kubestellar-console-bot App.
//
// Why this exists: the rewards leaderboard awards 300 pts for bugs and
// 100 pts for features, but only when the issue was submitted through
// the console UI. Users were gaming this by opening issues directly on
// github.com with a `bug` label. To prevent that, the console backend
// creates issues authenticated as a dedicated GitHub App; the rewards
// classifier then checks GitHub's own `performed_via_github_app` field
// on each issue — a field GitHub itself sets based on which credentials
// authenticated the create call, unforgeable by regular users.
//
// This file provides a token provider that:
//   1. Reads the App ID, Installation ID, and Private Key from env vars.
//   2. Mints a short-lived (10 min) App JWT signed with the private key.
//   3. Exchanges the JWT for a 60-min installation access token via the
//      GitHub API.
//   4. Caches the installation token and refreshes it ~5 min before
//      expiry so callers always get a valid token without doing their
//      own refresh logic.
//
// Fail-safe: if any of the three env vars is missing, tokenProvider
// returns an empty token and the handler falls back to the legacy
// FEEDBACK_GITHUB_TOKEN (PAT) path. The rewards classifier will then
// treat those issues as web-UI submissions (50 pts), under-awarding
// rather than over-awarding.

package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// ───────────────────────────────────────────────────────────────────────
// Env var names
// ───────────────────────────────────────────────────────────────────────

// appIDEnv is the GitHub App ID (numeric string). Set by the console
// deployment process; sourced from the KUBESTELLAR_CONSOLE_APP_ID repo
// secret via the deploy workflow.
const appIDEnv = "KUBESTELLAR_CONSOLE_APP_ID"

// appInstallationIDEnv is the installation ID for the App on the target
// account (numeric string). Sourced from KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID.
const appInstallationIDEnv = "KUBESTELLAR_CONSOLE_APP_INSTALLATION_ID"

// appPrivateKeyEnv is the PEM-encoded RSA private key. Sourced from
// KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY — the whole file contents, newlines and all.
const appPrivateKeyEnv = "KUBESTELLAR_CONSOLE_APP_PRIVATE_KEY"

// appSlugEnv overrides the expected App slug that the rewards classifier
// looks for on performed_via_github_app. Defaults to kubestellar-console-bot.
// Useful in forks / enterprise deployments that rename the App.
const appSlugEnv = "KUBESTELLAR_CONSOLE_APP_SLUG"

// DefaultConsoleAppSlug is the expected slug of the App that authored
// console-submitted issues. Rewards classifier checks this against the
// performed_via_github_app.slug field on each issue.
const DefaultConsoleAppSlug = "kubestellar-console-bot"

// ───────────────────────────────────────────────────────────────────────
// Token lifetimes
// ───────────────────────────────────────────────────────────────────────

// appJWTLifetime is how long the App JWT is valid. GitHub's max is 10
// minutes; we use the max to minimize the rate of JWT minting.
const appJWTLifetime = 9 * time.Minute

// tokenRefreshMargin is how long before expiry we proactively refresh.
// Installation tokens are 60-min; refreshing at 55 min gives callers a
// 5-min safety buffer in case of clock skew or GitHub API blips.
const tokenRefreshMargin = 5 * time.Minute

// tokenMintTimeout caps the HTTP call to GitHub's /app/installations/:id/access_tokens.
const tokenMintTimeout = 15 * time.Second

// ───────────────────────────────────────────────────────────────────────
// Provider
// ───────────────────────────────────────────────────────────────────────

// GitHubAppTokenProvider mints and caches installation access tokens for
// the kubestellar-console-bot App. Safe for concurrent use.
type GitHubAppTokenProvider struct {
	appID          string
	installationID string
	privateKeyPEM  []byte
	httpClient     *http.Client

	mu          sync.Mutex
	cachedToken string
	expiresAt   time.Time
}

// NewGitHubAppTokenProvider reads credentials from the standard env vars
// and returns a provider. Returns nil if any required var is missing —
// caller should treat nil as "App auth disabled" and fall back to the
// legacy PAT-based flow. Nil provider + feature flag off is the safe
// default state during rollout.
func NewGitHubAppTokenProvider() *GitHubAppTokenProvider {
	appID := os.Getenv(appIDEnv)
	installationID := os.Getenv(appInstallationIDEnv)
	privateKey := os.Getenv(appPrivateKeyEnv)
	if appID == "" || installationID == "" || privateKey == "" {
		slog.Info("[GitHubApp] credentials not fully configured — falling back to PAT auth for feedback issues",
			"app_id_set", appID != "",
			"installation_id_set", installationID != "",
			"private_key_set", privateKey != "")
		return nil
	}
	slog.Info("[GitHubApp] token provider initialized",
		"app_id", appID,
		"installation_id", installationID)
	return &GitHubAppTokenProvider{
		appID:          appID,
		installationID: installationID,
		privateKeyPEM:  []byte(privateKey),
		httpClient:     &http.Client{Timeout: tokenMintTimeout},
	}
}

// Token returns a valid installation access token. Uses the cached token
// if it's valid for at least tokenRefreshMargin; otherwise mints a fresh
// one. Safe to call on every issue creation — the cache makes this
// essentially free after the first mint.
func (p *GitHubAppTokenProvider) Token(ctx context.Context) (string, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	if p.cachedToken != "" && time.Until(p.expiresAt) > tokenRefreshMargin {
		return p.cachedToken, nil
	}

	tok, exp, err := p.mintInstallationToken(ctx)
	if err != nil {
		return "", err
	}
	p.cachedToken = tok
	p.expiresAt = exp
	return tok, nil
}

// ExpectedAppSlug returns the App slug the rewards classifier should
// look for on performed_via_github_app.slug. Reads from the
// KUBESTELLAR_CONSOLE_APP_SLUG env var, falling back to the default.
func ExpectedAppSlug() string {
	if v := os.Getenv(appSlugEnv); v != "" {
		return v
	}
	return DefaultConsoleAppSlug
}

// mintInstallationToken does the JWT → installation token dance.
func (p *GitHubAppTokenProvider) mintInstallationToken(ctx context.Context) (string, time.Time, error) {
	appJWT, err := p.signAppJWT()
	if err != nil {
		return "", time.Time{}, fmt.Errorf("sign app JWT: %w", err)
	}

	url := fmt.Sprintf("%s/app/installations/%s/access_tokens", resolveGitHubAPIBase(), p.installationID)
	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return "", time.Time{}, err
	}
	req.Header.Set("Authorization", "Bearer "+appJWT)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("installation token request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, maxGitHubResponseBytes))
		return "", time.Time{}, fmt.Errorf("installation token request returned %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", time.Time{}, fmt.Errorf("decode installation token: %w", err)
	}
	if result.Token == "" {
		return "", time.Time{}, fmt.Errorf("installation token response missing token field")
	}
	return result.Token, result.ExpiresAt, nil
}

// signAppJWT produces a short-lived JWT signed with the App private key.
// This is the credential GitHub accepts to mint installation tokens.
func (p *GitHubAppTokenProvider) signAppJWT() (string, error) {
	key, err := jwt.ParseRSAPrivateKeyFromPEM(p.privateKeyPEM)
	if err != nil {
		return "", fmt.Errorf("parse RSA private key: %w", err)
	}

	now := time.Now()
	claims := jwt.MapClaims{
		// Issued-at slightly in the past to tolerate clock skew with GitHub.
		"iat": now.Add(-60 * time.Second).Unix(),
		"exp": now.Add(appJWTLifetime).Unix(),
		"iss": p.appID,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(key)
}
