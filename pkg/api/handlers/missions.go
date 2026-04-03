package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/settings"
)

const (
	missionsAPITimeout   = 30 * time.Second
	missionsMaxBodyBytes = 10 * 1024 * 1024 // 10MB
	missionsMaxPathLen   = 512              // max length for path/ref parameters

	// forkHeadSHAMaxRetries is the number of attempts to resolve the fork's HEAD SHA
	// after fork creation, since GitHub may not have the ref ready immediately.
	forkHeadSHAMaxRetries = 5
	// forkHeadSHAInitialBackoff is the initial delay before the first retry when
	// polling for the fork's HEAD SHA.
	forkHeadSHAInitialBackoff = 1 * time.Second
	// forkHeadSHABackoffMultiplier is the factor by which the backoff delay increases
	// on each retry attempt.
	forkHeadSHABackoffMultiplier = 2

	// missionsCacheTTL is how long cached GitHub API responses are considered fresh.
	// Directory listings and file contents change infrequently (console-kb is updated
	// via PRs), so a 10-minute TTL provides a good balance between freshness and
	// reducing GitHub API calls.
	missionsCacheTTL = 10 * time.Minute

	// missionsCacheStaleTTL is how long stale cache entries can be served when
	// GitHub returns a rate-limit error (403/429). This prevents complete outages
	// when the unauthenticated rate limit (60 req/hr) is exhausted.
	missionsCacheStaleTTL = 1 * time.Hour

	// missionsCacheMaxEntries is the maximum number of entries in the response cache.
	// Each entry stores a directory listing or file body. This prevents unbounded
	// memory growth from deep directory traversals.
	missionsCacheMaxEntries = 256
)

// missionsCacheEntry holds a cached GitHub API response (directory listing or file content).
type missionsCacheEntry struct {
	body        []byte
	contentType string
	statusCode  int
	fetchedAt   time.Time
}

// missionsResponseCache is a concurrency-safe in-memory cache for GitHub API responses.
// The cache key is the full request URL. Entries are evicted when the cache exceeds
// missionsCacheMaxEntries (oldest-first eviction).
type missionsResponseCache struct {
	mu      sync.RWMutex
	entries map[string]*missionsCacheEntry
}

// get returns a cached entry if it exists and is within the given TTL.
// Returns nil if no entry exists or the entry is expired.
func (c *missionsResponseCache) get(key string, ttl time.Duration) *missionsCacheEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.entries[key]
	if !ok {
		return nil
	}
	if time.Since(entry.fetchedAt) > ttl {
		return nil
	}
	return entry
}

// getStale returns a cached entry even if expired, as long as it is within staleTTL.
// Used to serve stale data when GitHub rate-limits us — better than an error.
func (c *missionsResponseCache) getStale(key string, staleTTL time.Duration) *missionsCacheEntry {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.entries[key]
	if !ok {
		return nil
	}
	if time.Since(entry.fetchedAt) > staleTTL {
		return nil
	}
	return entry
}

// set stores a response in the cache, evicting the oldest entry if the cache is full.
func (c *missionsResponseCache) set(key string, entry *missionsCacheEntry) {
	c.mu.Lock()
	defer c.mu.Unlock()
	// Evict oldest entry if at capacity (simple strategy: find oldest and remove it)
	if len(c.entries) >= missionsCacheMaxEntries {
		var oldestKey string
		var oldestTime time.Time
		for k, v := range c.entries {
			if oldestKey == "" || v.fetchedAt.Before(oldestTime) {
				oldestKey = k
				oldestTime = v.fetchedAt
			}
		}
		if oldestKey != "" {
			delete(c.entries, oldestKey)
		}
	}
	c.entries[key] = entry
}

// sanitizePath validates and sanitizes a file path parameter.
// SECURITY: Blocks path traversal (../) and dangerous characters.
func sanitizePath(path string) (string, error) {
	if len(path) > missionsMaxPathLen {
		return "", fmt.Errorf("path exceeds maximum length of %d", missionsMaxPathLen)
	}
	// Block path traversal
	if strings.Contains(path, "..") {
		return "", fmt.Errorf("path traversal (..) is not allowed")
	}
	// Block null bytes
	if strings.ContainsRune(path, 0) {
		return "", fmt.Errorf("path contains null bytes")
	}
	// Block shell metacharacters and control characters
	for _, ch := range path {
		if ch < 0x20 || ch == '`' || ch == '$' || ch == '|' || ch == ';' || ch == '&' || ch == '\\' {
			return "", fmt.Errorf("path contains invalid character")
		}
	}
	// Normalize leading slash
	return strings.TrimPrefix(path, "/"), nil
}

// sanitizeRef validates a git ref (branch/tag) parameter.
// SECURITY: Blocks flag injection and dangerous patterns.
func sanitizeRef(ref string) (string, error) {
	if len(ref) > missionsMaxPathLen {
		return "", fmt.Errorf("ref exceeds maximum length")
	}
	if strings.HasPrefix(ref, "-") {
		return "", fmt.Errorf("ref must not start with '-'")
	}
	if strings.Contains(ref, "..") {
		return "", fmt.Errorf("ref must not contain '..'")
	}
	// Only allow alphanumeric, -, _, ., /
	for _, ch := range ref {
		if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') ||
			(ch >= '0' && ch <= '9') || ch == '-' || ch == '_' || ch == '.' || ch == '/') {
			return "", fmt.Errorf("ref contains invalid character: %c", ch)
		}
	}
	return ref, nil
}

// MissionsHandler handles mission-related API endpoints (knowledge base browsing,
// validation, sharing).
type MissionsHandler struct {
	httpClient   *http.Client
	githubAPIURL string // defaults to "https://api.github.com"
	githubRawURL string // defaults to "https://raw.githubusercontent.com"
	cache        *missionsResponseCache
}

// NewMissionsHandler creates a new MissionsHandler with default settings.
func NewMissionsHandler() *MissionsHandler {
	return &MissionsHandler{
		httpClient:   &http.Client{Timeout: missionsAPITimeout},
		githubAPIURL: "https://api.github.com",
		githubRawURL: "https://raw.githubusercontent.com",
		cache:        &missionsResponseCache{entries: make(map[string]*missionsCacheEntry)},
	}
}

// RegisterRoutes registers all mission routes on the given Fiber router group.
func (h *MissionsHandler) RegisterRoutes(g fiber.Router) {
	g.Post("/validate", h.ValidateMission)
	g.Post("/share/slack", h.ShareToSlack)
	g.Post("/share/github", h.ShareToGitHub)
}

// RegisterPublicRoutes registers unauthenticated browse/file routes (proxies to public GitHub repo).
func (h *MissionsHandler) RegisterPublicRoutes(g fiber.Router) {
	g.Get("/browse", h.BrowseConsoleKB)
	g.Get("/file", h.GetMissionFile)
}

// githubGet makes a GET request to the GitHub API, falling back to unauthenticated if token is expired.
func (h *MissionsHandler) githubGet(url string, clientToken string) (*http.Response, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	hasToken := false
	if clientToken != "" {
		req.Header.Set("Authorization", "Bearer "+clientToken)
		hasToken = true
	} else if token := settings.ResolveGitHubTokenEnv(); token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
		hasToken = true
	}

	resp, err := h.httpClient.Do(req)
	if err != nil {
		return nil, err
	}

	// If auth failed (401/403) or got 404 with a token (raw.githubusercontent returns 404 for bad tokens),
	// retry without auth — the target repo is public
	if hasToken && (resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusNotFound) {
		slog.Info(fmt.Sprintf("[missions] GitHub token returned %d for %s — retrying without auth (token may be expired)", resp.StatusCode, url))
		resp.Body.Close()
		retryReq, err := http.NewRequest("GET", url, nil)
		if err != nil {
			return nil, err
		}
		retryReq.Header.Set("Accept", "application/vnd.github.v3+json")
		retryResp, err := h.httpClient.Do(retryReq)
		if err != nil {
			return nil, err
		}
		if retryResp.StatusCode == http.StatusForbidden || retryResp.StatusCode == http.StatusTooManyRequests {
			slog.Error(fmt.Sprintf("[missions] Unauthenticated retry also failed (%d) for %s — likely rate-limited (check GITHUB_TOKEN in .env)", retryResp.StatusCode, url))
		}
		return retryResp, nil
	}

	return resp, nil
}

// ---------- Browse knowledge base ----------

// BrowseConsoleKB lists directory contents from the kubestellar/console-kb repo.
// GET /api/missions/browse?path=fixes
//
// Responses are cached server-side for missionsCacheTTL to eliminate redundant
// GitHub API calls. On rate-limit errors (403/429), stale cache entries are
// served for up to missionsCacheStaleTTL rather than returning an error.
func (h *MissionsHandler) BrowseConsoleKB(c *fiber.Ctx) error {
	path, err := sanitizePath(c.Query("path", ""))
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	cacheKey := "browse:" + path

	// Check fresh cache first
	if cached := h.cache.get(cacheKey, missionsCacheTTL); cached != nil {
		slog.Info(fmt.Sprintf("[missions] Cache HIT (browse) path=%q", path))
		c.Set("Content-Type", cached.contentType)
		c.Set("X-Cache", "HIT")
		return c.Status(cached.statusCode).Send(cached.body)
	}

	url := fmt.Sprintf("%s/repos/kubestellar/console-kb/contents/%s?ref=master", h.githubAPIURL, path)

	resp, err := h.githubGet(url, c.Get("X-GitHub-Token"))
	if err != nil {
		// Upstream failed — try stale cache
		if stale := h.cache.getStale(cacheKey, missionsCacheStaleTTL); stale != nil {
			slog.Error(fmt.Sprintf("[missions] Upstream error, serving STALE cache (browse) path=%q err=%v", path, err))
			c.Set("Content-Type", stale.contentType)
			c.Set("X-Cache", "STALE")
			return c.Status(stale.statusCode).Send(stale.body)
		}
		return c.Status(502).JSON(fiber.Map{"error": "upstream request failed"})
	}
	defer resp.Body.Close()

	limitedBody := io.LimitReader(resp.Body, missionsMaxBodyBytes)
	body, err := io.ReadAll(limitedBody)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read response body"})
	}

	// Rate-limited — serve stale cache if available
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		if stale := h.cache.getStale(cacheKey, missionsCacheStaleTTL); stale != nil {
			slog.Info(fmt.Sprintf("[missions] Rate-limited (%d), serving STALE cache (browse) path=%q", resp.StatusCode, path))
			c.Set("Content-Type", stale.contentType)
			c.Set("X-Cache", "STALE")
			return c.Status(stale.statusCode).Send(stale.body)
		}
		return c.Status(resp.StatusCode).JSON(fiber.Map{
			"error":  "GitHub API rate limit exceeded — no cached data available",
			"status": resp.StatusCode,
			"code":   "rate_limited",
		})
	}

	if resp.StatusCode != http.StatusOK {
		code := "github_error"
		if resp.StatusCode == http.StatusUnauthorized {
			code = "token_invalid"
		}
		return c.Status(resp.StatusCode).JSON(fiber.Map{"error": "GitHub API error", "status": resp.StatusCode, "code": code})
	}

	// GitHub returns type:"dir", frontend expects type:"directory" — transform
	var ghEntries []map[string]interface{}
	if err := json.Unmarshal(body, &ghEntries); err != nil {
		c.Set("Content-Type", "application/json")
		return c.Send(body)
	}

	// Files to hide from the browser UI — infrastructure/metadata files that
	// are not missions and would confuse users browsing the library.
	hiddenFiles := map[string]bool{
		".gitkeep":   true,
		"index.json": true,
	}

	var entries []fiber.Map
	for _, e := range ghEntries {
		entryType, _ := e["type"].(string)
		if entryType == "dir" {
			entryType = "directory"
		}
		name, _ := e["name"].(string)
		// Skip infrastructure files that are not missions
		if entryType == "file" && hiddenFiles[name] {
			continue
		}
		path, _ := e["path"].(string)
		size, _ := e["size"].(float64)
		entries = append(entries, fiber.Map{
			"name": name,
			"path": path,
			"type": entryType,
			"size": int(size),
		})
	}

	// Cache the transformed response
	transformedBody, err := json.Marshal(entries)
	if err == nil {
		h.cache.set(cacheKey, &missionsCacheEntry{
			body:        transformedBody,
			contentType: "application/json",
			statusCode:  http.StatusOK,
			fetchedAt:   time.Now(),
		})
		slog.Info(fmt.Sprintf("[missions] Cache MISS → stored (browse) path=%q", path))
	}

	c.Set("X-Cache", "MISS")
	return c.JSON(entries)
}

// ---------- Get a single file ----------

// GetMissionFile fetches raw file content from the kubestellar/console-kb repo.
// GET /api/missions/file?path=fixes/cncf-generated/kubernetes/kubernetes-42873.json
//
// Responses are cached server-side for missionsCacheTTL to avoid redundant
// GitHub raw content fetches. The fixes/index.json file is the most critical
// cache entry — it is fetched once and serves all mission browser listings,
// eliminating the N+1 request pattern.
func (h *MissionsHandler) GetMissionFile(c *fiber.Ctx) error {
	rawPath := c.Query("path")
	if rawPath == "" {
		return c.Status(400).JSON(fiber.Map{"error": "path query parameter is required"})
	}
	path, err := sanitizePath(rawPath)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	rawRef := c.Query("ref", "master")
	ref, err := sanitizeRef(rawRef)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}

	cacheKey := "file:" + ref + ":" + path

	// Check fresh cache first
	if cached := h.cache.get(cacheKey, missionsCacheTTL); cached != nil {
		slog.Info(fmt.Sprintf("[missions] Cache HIT (file) ref=%q path=%q", ref, path))
		c.Set("Content-Type", cached.contentType)
		c.Set("X-Cache", "HIT")
		return c.Status(cached.statusCode).Send(cached.body)
	}

	url := fmt.Sprintf("%s/kubestellar/console-kb/%s/%s", h.githubRawURL, ref, path)

	resp, err := h.githubGet(url, c.Get("X-GitHub-Token"))
	if err != nil {
		// Upstream failed — try stale cache
		if stale := h.cache.getStale(cacheKey, missionsCacheStaleTTL); stale != nil {
			slog.Error(fmt.Sprintf("[missions] Upstream error, serving STALE cache (file) ref=%q path=%q err=%v", ref, path, err))
			c.Set("Content-Type", stale.contentType)
			c.Set("X-Cache", "STALE")
			return c.Status(stale.statusCode).Send(stale.body)
		}
		return c.Status(502).JSON(fiber.Map{"error": "upstream request failed"})
	}
	defer resp.Body.Close()

	limitedBody := io.LimitReader(resp.Body, missionsMaxBodyBytes)
	body, err := io.ReadAll(limitedBody)
	if err != nil {
		return c.Status(http.StatusInternalServerError).JSON(fiber.Map{"error": "failed to read response body"})
	}

	// Rate-limited — serve stale cache if available
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
		if stale := h.cache.getStale(cacheKey, missionsCacheStaleTTL); stale != nil {
			slog.Info(fmt.Sprintf("[missions] Rate-limited (%d), serving STALE cache (file) ref=%q path=%q", resp.StatusCode, ref, path))
			c.Set("Content-Type", stale.contentType)
			c.Set("X-Cache", "STALE")
			return c.Status(stale.statusCode).Send(stale.body)
		}
		return c.Status(resp.StatusCode).JSON(fiber.Map{
			"error":  "GitHub API rate limit exceeded — no cached data available",
			"status": resp.StatusCode,
			"code":   "rate_limited",
		})
	}

	if resp.StatusCode == http.StatusNotFound {
		return c.Status(404).JSON(fiber.Map{"error": "file not found"})
	}
	if resp.StatusCode != http.StatusOK {
		return c.Status(resp.StatusCode).JSON(fiber.Map{"error": "GitHub raw content error"})
	}

	// Cache the successful response
	h.cache.set(cacheKey, &missionsCacheEntry{
		body:        body,
		contentType: "text/plain",
		statusCode:  http.StatusOK,
		fetchedAt:   time.Now(),
	})
	slog.Info(fmt.Sprintf("[missions] Cache MISS → stored (file) ref=%q path=%q (%d bytes)", ref, path, len(body)))

	c.Set("Content-Type", "text/plain")
	c.Set("X-Cache", "MISS")
	return c.Send(body)
}

// ---------- Validate a mission ----------

// MissionSpec is the minimal structure for a kc-mission-v1 document.
type MissionSpec struct {
	APIVersion string `json:"apiVersion"`
	Kind       string `json:"kind"`
	Metadata   struct {
		Name string `json:"name"`
	} `json:"metadata"`
	Spec struct {
		Description string `json:"description"`
	} `json:"spec"`
}

// ValidateMission validates a kc-mission-v1 JSON payload.
// POST /api/missions/validate
func (h *MissionsHandler) ValidateMission(c *fiber.Ctx) error {
	body := c.Body()
	if len(body) == 0 {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": []string{"empty body"}})
	}
	if len(body) > missionsMaxBodyBytes {
		return c.Status(413).JSON(fiber.Map{"valid": false, "errors": []string{"payload too large"}})
	}

	var mission MissionSpec
	if err := json.Unmarshal(body, &mission); err != nil {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": []string{"invalid JSON format"}})
	}

	var errs []string
	if mission.APIVersion != "kc-mission-v1" {
		errs = append(errs, "apiVersion must be 'kc-mission-v1'")
	}
	if mission.Kind == "" {
		errs = append(errs, "kind is required")
	}
	if mission.Metadata.Name == "" {
		errs = append(errs, "metadata.name is required")
	}

	if len(errs) > 0 {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": errs})
	}
	return c.JSON(fiber.Map{"valid": true})
}

// ---------- Share to Slack ----------

// SlackShareRequest is the payload for sharing a mission to Slack.
type SlackShareRequest struct {
	WebhookURL string `json:"webhookUrl"`
	Text       string `json:"text"`
}

// ShareToSlack posts a message to a Slack webhook.
// POST /api/missions/share/slack
func (h *MissionsHandler) ShareToSlack(c *fiber.Ctx) error {
	var req SlackShareRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.WebhookURL == "" || !strings.HasPrefix(req.WebhookURL, "https://hooks.slack.com/") {
		return c.Status(400).JSON(fiber.Map{"error": "invalid or missing webhook URL"})
	}
	if req.Text == "" {
		return c.Status(400).JSON(fiber.Map{"error": "text is required"})
	}

	payload, err := json.Marshal(map[string]string{"text": req.Text})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to marshal payload"})
	}
	httpReq, err := http.NewRequest("POST", req.WebhookURL, bytes.NewReader(payload))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build request"})
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(httpReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "slack webhook request failed"})
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("slack returned status %d", resp.StatusCode)})
	}
	return c.JSON(fiber.Map{"success": true})
}

// ---------- Share to GitHub (fork → branch → commit → PR) ----------

// GitHubShareRequest is the payload for sharing a mission to GitHub as a PR.
type GitHubShareRequest struct {
	Repo     string `json:"repo"`     // e.g. "kubestellar/console"
	FilePath string `json:"filePath"` // path in repo
	Content  string `json:"content"`  // file content (base64)
	Message  string `json:"message"`  // commit message
	Branch   string `json:"branch"`   // new branch name
}

// ShareToGitHub creates a PR with the mission file.
// POST /api/missions/share/github
func (h *MissionsHandler) ShareToGitHub(c *fiber.Ctx) error {
	token := c.Get("X-GitHub-Token")
	if token == "" {
		return c.Status(401).JSON(fiber.Map{"error": "X-GitHub-Token header is required"})
	}

	var req GitHubShareRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Repo == "" || req.FilePath == "" || req.Content == "" || req.Branch == "" {
		return c.Status(400).JSON(fiber.Map{"error": "repo, filePath, content, and branch are required"})
	}

	// SECURITY: Validate path and branch to prevent traversal/injection
	if _, err := sanitizePath(req.FilePath); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("invalid filePath: %v", err)})
	}
	if _, err := sanitizeRef(req.Branch); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("invalid branch: %v", err)})
	}

	// Step 1: Fork the repo
	forkURL := fmt.Sprintf("%s/repos/%s/forks", h.githubAPIURL, req.Repo)
	forkReq, err := http.NewRequest("POST", forkURL, nil)
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build fork request"})
	}
	forkReq.Header.Set("Authorization", "Bearer "+token)
	forkReq.Header.Set("Accept", "application/vnd.github.v3+json")
	forkResp, err := h.httpClient.Do(forkReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to fork repo"})
	}
	defer forkResp.Body.Close()

	if forkResp.StatusCode < 200 || forkResp.StatusCode >= 300 {
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub fork failed with status %d", forkResp.StatusCode)})
	}
	var forkData map[string]interface{}
	if err := json.NewDecoder(forkResp.Body).Decode(&forkData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode fork response"})
	}
	forkFullName, _ := forkData["full_name"].(string)
	if forkFullName == "" {
		return c.Status(502).JSON(fiber.Map{"error": "fork response missing full_name"})
	}

	// Step 2: Get HEAD SHA from fork's main branch, then create new branch ref.
	// After fork creation, GitHub may not have the ref ready immediately (#2382).
	// Retry with exponential backoff to handle this race condition.
	mainRefURL := fmt.Sprintf("%s/repos/%s/git/ref/heads/main", h.githubAPIURL, forkFullName)
	var headSHA string
	backoff := forkHeadSHAInitialBackoff
	for attempt := 0; attempt < forkHeadSHAMaxRetries; attempt++ {
		mainRefReq, err := http.NewRequest("GET", mainRefURL, nil)
		if err != nil {
			return c.Status(500).JSON(fiber.Map{"error": "failed to build ref request"})
		}
		mainRefReq.Header.Set("Authorization", "Bearer "+token)
		mainRefReq.Header.Set("Accept", "application/vnd.github.v3+json")
		mainRefResp, err := h.httpClient.Do(mainRefReq)
		if err != nil {
			return c.Status(502).JSON(fiber.Map{"error": "failed to get main branch ref"})
		}

		var refData map[string]interface{}
		decodeErr := json.NewDecoder(mainRefResp.Body).Decode(&refData)
		mainRefResp.Body.Close()
		if decodeErr != nil {
			return c.Status(502).JSON(fiber.Map{"error": "failed to decode ref response"})
		}

		if mainRefResp.StatusCode == http.StatusOK {
			obj, _ := refData["object"].(map[string]interface{})
			sha, _ := obj["sha"].(string)
			if sha != "" {
				headSHA = sha
				break
			}
		}

		// If this is not the last attempt, wait before retrying
		if attempt < forkHeadSHAMaxRetries-1 {
			slog.Info(fmt.Sprintf("[missions] Fork HEAD SHA not yet available (attempt %d/%d, status %d) — retrying in %v",
				attempt+1, forkHeadSHAMaxRetries, mainRefResp.StatusCode, backoff))
			time.Sleep(backoff)
			backoff *= forkHeadSHABackoffMultiplier
		}
	}
	if headSHA == "" {
		return c.Status(502).JSON(fiber.Map{"error": "could not resolve HEAD SHA for fork's main branch after retries"})
	}

	refURL := fmt.Sprintf("%s/repos/%s/git/refs", h.githubAPIURL, forkFullName)
	refPayload, err := json.Marshal(map[string]string{
		"ref": "refs/heads/" + req.Branch,
		"sha": headSHA,
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to marshal branch ref payload"})
	}
	refReq, err := http.NewRequest("POST", refURL, bytes.NewReader(refPayload))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build branch ref request"})
	}
	refReq.Header.Set("Authorization", "Bearer "+token)
	refReq.Header.Set("Accept", "application/vnd.github.v3+json")
	branchResp, err := h.httpClient.Do(refReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to create branch ref"})
	}
	defer branchResp.Body.Close()
	if branchResp.StatusCode < 200 || branchResp.StatusCode >= 300 {
		// 422 (Unprocessable Entity) means the branch already exists, which is acceptable
		if branchResp.StatusCode != http.StatusUnprocessableEntity {
			return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub branch creation failed with status %d", branchResp.StatusCode)})
		}
	}

	// Step 3: Create/update file (commit)
	fileURL := fmt.Sprintf("%s/repos/%s/contents/%s", h.githubAPIURL, forkFullName, req.FilePath)
	filePayload, err := json.Marshal(map[string]string{
		"message": req.Message,
		"content": req.Content,
		"branch":  req.Branch,
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to marshal file commit payload"})
	}
	fileReq, err := http.NewRequest("PUT", fileURL, bytes.NewReader(filePayload))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build file commit request"})
	}
	fileReq.Header.Set("Authorization", "Bearer "+token)
	fileReq.Header.Set("Accept", "application/vnd.github.v3+json")
	fileResp, err := h.httpClient.Do(fileReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to commit file"})
	}
	defer fileResp.Body.Close()

	// Validate commit response status (#2384) and content (#2381)
	if fileResp.StatusCode < 200 || fileResp.StatusCode >= 300 {
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub commit failed with status %d", fileResp.StatusCode)})
	}
	var commitData map[string]interface{}
	if err := json.NewDecoder(fileResp.Body).Decode(&commitData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode commit response"})
	}
	// The GitHub Contents API returns a "content" object with "sha" on success
	commitContent, _ := commitData["content"].(map[string]interface{})
	commitSHA, _ := commitContent["sha"].(string)
	if commitSHA == "" {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub commit response missing expected content SHA"})
	}

	// Step 4: Create PR
	prURL := fmt.Sprintf("%s/repos/%s/pulls", h.githubAPIURL, req.Repo)
	prPayload, err := json.Marshal(map[string]interface{}{
		"title": req.Message,
		"head":  strings.Split(forkFullName, "/")[0] + ":" + req.Branch,
		"base":  "main",
		"body":  "Mission shared via KubeStellar Console",
	})
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to marshal PR payload"})
	}
	prReq, err := http.NewRequest("POST", prURL, bytes.NewReader(prPayload))
	if err != nil {
		return c.Status(500).JSON(fiber.Map{"error": "failed to build PR request"})
	}
	prReq.Header.Set("Authorization", "Bearer "+token)
	prReq.Header.Set("Accept", "application/vnd.github.v3+json")
	prResp, err := h.httpClient.Do(prReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to create PR"})
	}
	defer prResp.Body.Close()

	// Validate PR creation response (#2384)
	if prResp.StatusCode < 200 || prResp.StatusCode >= 300 {
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub PR creation failed with status %d", prResp.StatusCode)})
	}
	var prData map[string]interface{}
	if err := json.NewDecoder(prResp.Body).Decode(&prData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode PR response"})
	}
	prHTMLURL, _ := prData["html_url"].(string)
	if prHTMLURL == "" {
		return c.Status(502).JSON(fiber.Map{"error": "GitHub PR response missing html_url"})
	}

	return c.JSON(fiber.Map{
		"success": true,
		"pr_url":  prHTMLURL,
		"fork":    forkFullName,
	})
}
