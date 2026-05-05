package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"path"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/audit"
	"github.com/kubestellar/console/pkg/settings"
)

const (
	missionsAPITimeout   = 30 * time.Second
	missionsMaxBodyBytes = 10 * 1024 * 1024 // 10MB
	missionsMaxPathLen   = 512              // max length for path/ref parameters

	// missionsGitHubShareMaxBytes bounds the JSON payload accepted by
	// ShareToGitHub. The GitHub Contents API accepts base64 file content;
	// anything larger than ~1 MiB of encoded content is almost certainly
	// abusive (we are sharing kc-mission JSON docs, not binaries). Reject
	// oversize payloads with 413 instead of buffering up to
	// missionsMaxBodyBytes and holding an http client goroutine for 30s
	// (see #6419).
	missionsGitHubShareMaxBytes = 1 * 1024 * 1024 // 1 MiB

	// forkHeadSHAMaxRetries bounds how many times we poll for the fork's HEAD
	// SHA after fork creation, since GitHub may not have the ref ready
	// immediately. The retry budget below is deliberately tight — the handler
	// is synchronous and must not hold a goroutine for longer than a user is
	// willing to wait on an HTTP request (see #6420). With an initial backoff
	// of 1s and a 1.5x multiplier, 5 attempts fit inside ~10s wall time
	// (1 + 1.5 + 2.25 + 3.375 ~= 8.1s of sleep). A true fix would make the
	// fork flow asynchronous (202 Accepted + poll endpoint), but that
	// requires frontend changes tracked separately.
	forkHeadSHAMaxRetries = 5
	// forkHeadSHAInitialBackoff is the initial delay before the first retry
	// when polling for the fork's HEAD SHA.
	forkHeadSHAInitialBackoff = 1 * time.Second
	// forkHeadSHABackoffMultiplier is the factor by which the backoff delay
	// increases on each retry attempt. Uses a float multiplier so the total
	// wait time stays bounded under ~10s (#6420).
	forkHeadSHABackoffMultiplier = 1.5

	// missionsCacheTTL is how long cached GitHub API responses are considered fresh.
	// Directory listings and file contents change infrequently (console-kb is updated
	// via PRs), so a 10-minute TTL provides a good balance between freshness and
	// reducing GitHub API calls.
	missionsCacheTTL = 10 * time.Minute

	// missionsCacheStaleTTL is how long stale cache entries can be served when
	// GitHub returns a rate-limit error (403/429). This prevents complete outages
	// when the unauthenticated rate limit (60 req/hr) is exhausted.
	missionsCacheStaleTTL = 1 * time.Hour

	// missionsMaxFetchRetries is the number of retry attempts for transient
	// upstream errors (5xx, network timeouts) before falling back to stale
	// cache or returning 502. Retries use exponential backoff starting at
	// missionsFetchRetryBaseDelay. (#10966)
	missionsMaxFetchRetries     = 2
	missionsFetchRetryBaseDelay = 500 * time.Millisecond

	// missionsCacheMaxEntries is the maximum number of entries in the response cache.
	// Each entry stores a directory listing or file body.
	missionsCacheMaxEntries = 256

	// missionsValidateMaxBytes is a tighter payload cap for ValidateMission.
	// Mission JSON documents are small structured metadata — legitimate payloads
	// are well under 1 MiB. Accepting the full missionsMaxBodyBytes (10 MiB) for
	// json.Unmarshal invites deeply-nested payloads that stress the decoder.
	// Reject oversize validate requests early with 413 (#6820).
	missionsValidateMaxBytes = 1 * 1024 * 1024 // 1 MiB

	// slackMaxTextBytes is the maximum allowed size for the Text field in a
	// SlackShareRequest. Slack messages are typically short; 10 KB is more
	// than enough for any legitimate use. Without this cap a caller could
	// POST up to missionsMaxBodyBytes (10 MiB) of text that gets forwarded
	// to Slack, buffering the full payload in-process (#6817).
	slackMaxTextBytes = 10 * 1024 // 10 KB

	// missionsCacheMaxBytes bounds the TOTAL byte size of all cache entries,
	// not just the entry count. Without this bound an attacker could fill
	// missionsCacheMaxEntries slots with ~10 MiB file bodies each (the
	// per-request missionsMaxBodyBytes cap), pushing ~2.5 GiB into resident
	// memory (#6417). 256 MiB is a reasonable ceiling: large enough to hold
	// the entire kubestellar/console-kb repo (~tens of MiB) with headroom,
	// small enough that a single process footprint stays predictable.
	missionsCacheMaxBytes = 256 * 1024 * 1024 // 256 MiB
)

// missionsDefaultShareRepos is the built-in allowlist of repositories that
// ShareToGitHub will create PRs against. Operators can extend this via the
// KC_ALLOWED_SHARE_REPOS environment variable (comma-separated list of
// `owner/repo` entries). #6439 — without an allowlist, a misbehaving client
// could point the handler at any repository the user's PAT has write access
// to, using the console's UI as a confused-deputy PR-creation service.
// console-kb is the canonical destination because shared missions land in the
// community mission library (the same repo GetMissionFile reads from).
var missionsDefaultShareRepos = []string{
	"kubestellar/console-kb",
}

// allowedShareRepoEnvVar is the environment variable name operators use to
// extend the built-in share-repo allowlist at runtime without a code change.
const allowedShareRepoEnvVar = "KC_ALLOWED_SHARE_REPOS"

// resolveAllowedShareRepos returns the effective allowlist of `owner/repo`
// destinations for ShareToGitHub. The built-in defaults are always included;
// any entries from KC_ALLOWED_SHARE_REPOS are appended. Empty/whitespace
// entries are ignored.
func resolveAllowedShareRepos() []string {
	allowed := make([]string, 0, len(missionsDefaultShareRepos)+1)
	allowed = append(allowed, missionsDefaultShareRepos...)
	if extra := os.Getenv(allowedShareRepoEnvVar); extra != "" {
		for _, r := range strings.Split(extra, ",") {
			r = strings.TrimSpace(r)
			if r != "" {
				allowed = append(allowed, r)
			}
		}
	}
	return allowed
}

// isRepoAllowedForShare reports whether the given `owner/repo` string is on
// the effective ShareToGitHub allowlist.
//
// #6453(B) — Comparison is case-INSENSITIVE. GitHub itself treats owner/repo
// slugs as case-insensitive in both URLs and API calls, so we do the same here
// to be forgiving of operator casing in KC_ALLOWED_SHARE_REPOS (e.g. a value
// of `Kubestellar/Console-KB` will still match a request for
// `kubestellar/console-kb`). Previously the check was exact-match, which was
// stricter than GitHub's own handling and caused spurious 400s. See also
// isRepoAllowedForShareWithList for the path that avoids re-parsing the env
// var on every call.
func isRepoAllowedForShare(repo string) bool {
	return isRepoAllowedForShareWithList(repo, resolveAllowedShareRepos())
}

// isRepoAllowedForShareWithList is the inner, list-accepting form of
// isRepoAllowedForShare. #6453(A) — ShareToGitHub resolves the allowlist once
// per request and passes it through to this function for the membership check
// AND for the error-response payload, avoiding a double call to
// resolveAllowedShareRepos() (which re-parses KC_ALLOWED_SHARE_REPOS and could
// observe a different value between calls if the env changes mid-request).
func isRepoAllowedForShareWithList(repo string, allowed []string) bool {
	repoLower := strings.ToLower(repo)
	for _, a := range allowed {
		if repoLower == strings.ToLower(a) {
			return true
		}
	}
	return false
}

// missionsCacheEntry holds a cached GitHub API response (directory listing or file content).
type missionsCacheEntry struct {
	body        []byte
	contentType string
	statusCode  int
	fetchedAt   time.Time
}

// missionsResponseCache is a concurrency-safe in-memory cache for GitHub API responses.
// The cache key is the full request URL. Entries are evicted (oldest-first) when
// either the entry count exceeds missionsCacheMaxEntries or the total byte size
// exceeds missionsCacheMaxBytes (#6417).
// #6841 — insertOrder tracks keys in insertion order for O(1) oldest-key lookup
// during eviction, replacing the previous O(n) map scan.
type missionsResponseCache struct {
	mu          sync.RWMutex
	entries     map[string]*missionsCacheEntry
	insertOrder []string
	totalBytes  int
}

// get returns a cached entry if it exists and is within the given TTL.
// Returns nil if no entry exists or the entry is expired.
//
// #6822 — Returns a shallow copy of the entry so callers cannot mutate
// the shared cache data after the read lock is released.
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
	cp := *entry
	return &cp
}

// getStale returns a cached entry even if expired, as long as it is within staleTTL.
// Used to serve stale data when GitHub rate-limits us — better than an error.
//
// #6822 — Returns a shallow copy (same rationale as get).
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
	cp := *entry
	return &cp
}

// evictOldestLocked removes the single oldest entry from the cache.
// Returns true if an entry was evicted.
//
// REQUIRES: c.mu held in WRITE mode by the caller (#6821).
//
// Currently called only from set(), which acquires c.mu.Lock() before
// invoking this method. Any new call-site MUST hold the write lock —
// this function reads and modifies c.entries, c.insertOrder, and
// c.totalBytes without further synchronisation.
//
// #6841 — Uses the insertOrder slice for O(1) oldest-key lookup instead of
// scanning the entire map on every eviction.
func (c *missionsResponseCache) evictOldestLocked() bool {
	for len(c.insertOrder) > 0 {
		oldestKey := c.insertOrder[0]
		c.insertOrder = c.insertOrder[1:]
		if prev, ok := c.entries[oldestKey]; ok {
			c.totalBytes -= len(prev.body)
			delete(c.entries, oldestKey)
			return true
		}
		// Key was already deleted (e.g. overwritten by set); skip to next.
	}
	return false
}

// set stores a response in the cache, evicting older entries until both the
// entry-count cap (missionsCacheMaxEntries) and the byte-size cap
// (missionsCacheMaxBytes) are satisfied (#6417). A single entry larger than
// the byte cap is rejected rather than evicting the entire cache to make room.
func (c *missionsResponseCache) set(key string, entry *missionsCacheEntry) {
	entrySize := len(entry.body)
	// Reject pathological single entries that would blow the byte cap on their own.
	if entrySize > missionsCacheMaxBytes {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	// If the key already exists, account for its old size before replacing.
	// Note: we do NOT remove from insertOrder here; evictOldestLocked skips
	// stale entries that are no longer in the map.
	if prev, ok := c.entries[key]; ok {
		c.totalBytes -= len(prev.body)
		delete(c.entries, key)
	}
	// Evict oldest entries until both caps will be satisfied after insertion.
	// #7132 — Guard against infinite loops: if len(entries)==0 but totalBytes
	// somehow remains above the threshold (e.g. all 0-byte payloads), break
	// immediately instead of spinning on an empty map.
	for len(c.entries) >= missionsCacheMaxEntries || c.totalBytes+entrySize > missionsCacheMaxBytes {
		if len(c.entries) == 0 {
			// Nothing left to evict — reset totalBytes as a safety net.
			c.totalBytes = 0
			break
		}
		if !c.evictOldestLocked() {
			break
		}
	}
	c.entries[key] = entry
	c.insertOrder = append(c.insertOrder, key)
	c.totalBytes += entrySize
}

// sanitizePath validates and sanitizes a file path parameter.
//
// SECURITY (#6418): The naive version of this function used
// `strings.Contains(rawPath, "..")` to block traversal, but Fiber's c.Query
// URL-decodes exactly once. An attacker sending %252e%252e%252f gets one
// decode from Fiber down to %2e%2e%2f, which does NOT contain the literal
// string ".." and so bypassed the check. The raw string was then forwarded
// into a fmt.Sprintf'd GitHub URL where a downstream consumer could decode
// it a second time into ../ and escape the /missions/ base directory.
//
// The hardened version URL-decodes the input one extra time (matching the
// worst-case double-decoding downstream), runs path.Clean on it, and
// rejects any result that still contains a traversal component.
func sanitizePath(raw string) (string, error) {
	if len(raw) > missionsMaxPathLen {
		return "", fmt.Errorf("path exceeds maximum length of %d", missionsMaxPathLen)
	}
	// Decode repeatedly until the string stops changing. Fiber's c.Query
	// has already decoded once before we see the value; an attacker who
	// knows this can defeat a naive single-pass check by double- or
	// triple-encoding (%252e → %2e → .). Iterating until a fixed point
	// catches arbitrary nesting. Bound the iteration count so a
	// pathological input cannot spin forever.
	const maxDecodeIterations = 5
	decoded := raw
	for i := 0; i < maxDecodeIterations; i++ {
		next, err := url.QueryUnescape(decoded)
		if err != nil {
			return "", fmt.Errorf("invalid path encoding")
		}
		if next == decoded {
			break
		}
		decoded = next
	}
	// If the input required the maximum number of decode passes and is
	// still changing, it's pathologically nested — reject outright.
	if next, err := url.QueryUnescape(decoded); err == nil && next != decoded {
		return "", fmt.Errorf("invalid path encoding")
	}
	// Normalize forward and backslash variants — Windows-style separators
	// should never appear in a GitHub content path, but decoded %5c would
	// produce them and some downstream callers treat them as separators.
	if strings.ContainsAny(decoded, "\\") {
		return "", fmt.Errorf("path contains invalid character")
	}
	// Block null bytes
	if strings.ContainsRune(decoded, 0) {
		return "", fmt.Errorf("path contains null bytes")
	}
	// Block shell metacharacters and control characters
	for _, ch := range decoded {
		if ch < 0x20 || ch == '`' || ch == '$' || ch == '|' || ch == ';' || ch == '&' {
			return "", fmt.Errorf("path contains invalid character")
		}
	}
	// Detect traversal explicitly before path.Clean — path.Clean would
	// silently collapse "../etc/passwd" to "etc/passwd" and hide the
	// escape attempt from any post-clean check. Split on slash and reject
	// if any segment is exactly ".." (the only form that walks up a
	// directory in POSIX path semantics after decoding).
	for _, seg := range strings.Split(decoded, "/") {
		if seg == ".." {
			return "", fmt.Errorf("path traversal (..) is not allowed")
		}
	}
	// Belt-and-suspenders: path.Clean as a second-pass canonicalizer
	// catches adjacent-slash artifacts and leading "./". We anchor on
	// "/" so that a cleaned result of "/" maps back to the empty root.
	cleaned := path.Clean("/" + decoded)
	// After Clean, the literal ".." substring should never survive unless
	// the attacker smuggled something pathological (e.g. ".../...//").
	if strings.Contains(cleaned, "..") {
		return "", fmt.Errorf("path traversal (..) is not allowed")
	}
	// Strip the leading slash we added for path.Clean; empty path (root of
	// console-kb) is valid and maps to the repo root listing.
	result := strings.TrimPrefix(cleaned, "/")
	if result == "." {
		result = ""
	}
	return result, nil
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
	g.Get("/scores", h.GetKBScores)
	g.Get("/scores/:project/:id", h.GetMissionScore)
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
		slog.Info("[missions] GitHub token returned error, retrying without auth", "status", resp.StatusCode, "url", url)
		// #6823 — Drain the body before closing so the underlying TCP
		// connection is returned to the pool for reuse (HTTP/1.1 keep-alive).
		io.Copy(io.Discard, resp.Body) //nolint:errcheck // best-effort drain
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
		// Note: Caller is responsible for closing retryResp.Body
		if retryResp.StatusCode == http.StatusForbidden || retryResp.StatusCode == http.StatusTooManyRequests {
			slog.Error("[missions] unauthenticated retry also failed, likely rate-limited", "status", retryResp.StatusCode, "url", url)
		}
		return retryResp, nil
	}

	// Note: Caller is responsible for closing resp.Body
	return resp, nil
}

// cacheStatus indicates whether a fetchWithCache result came from a fresh cache
// hit, a network fetch (cache miss), or a stale entry served during upstream errors.
type cacheStatus string

const (
	cacheStatusHit   cacheStatus = "HIT"
	cacheStatusMiss  cacheStatus = "MISS"
	cacheStatusStale cacheStatus = "STALE"
)

// fetchWithCache encapsulates the common fetch-with-cache pattern used by GitHub wrappers.
// It checks fresh cache, calls githubGet, drains/limits the body, and falls back to stale cache on upstream/rate-limit errors.
// It does NOT store the final response in fresh cache (callers must do this to support transforming before caching).
type githubFetchResult struct {
	Body        []byte
	StatusCode  int
	ContentType string
	CacheStatus cacheStatus
}

func (h *MissionsHandler) fetchWithCache(c *fiber.Ctx, cacheKey, url, logContext string, logArgs ...any) (*githubFetchResult, error) {
	if cached := h.cache.get(cacheKey, missionsCacheTTL); cached != nil {
		slog.Info("[missions] cache HIT "+logContext, logArgs...)
		return &githubFetchResult{
			Body:        cached.body,
			StatusCode:  cached.statusCode,
			ContentType: cached.contentType,
			CacheStatus: cacheStatusHit,
		}, nil
	}

	// Retry loop for transient upstream errors (#10966).
	// Network failures and 5xx responses are retried with exponential backoff
	// before falling back to stale cache or returning 502.
	var (
		resp *http.Response
		err  error
		body []byte
	)
	for attempt := 0; attempt <= missionsMaxFetchRetries; attempt++ {
		if attempt > 0 {
			delay := missionsFetchRetryBaseDelay * time.Duration(1<<(attempt-1))
			slog.Info("[missions] retrying upstream fetch "+logContext, append(logArgs, "attempt", attempt+1, "delay", delay)...)
			// Monitor context cancellation to avoid orphaned goroutines on client disconnect
			select {
			case <-c.Context().Done():
				return &githubFetchResult{StatusCode: http.StatusServiceUnavailable}, c.Context().Err()
			case <-time.After(delay):
				// Continue to retry
			}
		}

		resp, err = h.githubGet(url, c.Get("X-GitHub-Token"))
		if err != nil {
			continue
		}

		body, err = func() ([]byte, error) {
			defer resp.Body.Close()
			return io.ReadAll(io.LimitReader(resp.Body, missionsMaxBodyBytes))
		}()
		if err != nil {
			slog.Error("[missions] failed to read response body "+logContext, append(logArgs, "error", err, "attempt", attempt+1)...)
			continue
		}

		// Rate-limited — don't retry, fall through to stale cache
		if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests {
			break
		}

		// 5xx — retry if attempts remain
		if resp.StatusCode >= 500 {
			slog.Warn("[missions] upstream 5xx "+logContext, append(logArgs, "status", resp.StatusCode, "attempt", attempt+1)...)
			continue
		}

		// Success or 4xx client error — return immediately
		return &githubFetchResult{
			Body:        body,
			StatusCode:  resp.StatusCode,
			CacheStatus: cacheStatusMiss,
		}, nil
	}

	// All retries exhausted — try stale cache before failing
	if resp != nil && (resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusTooManyRequests) {
		if stale := h.cache.getStale(cacheKey, missionsCacheStaleTTL); stale != nil {
			slog.Info("[missions] rate-limited, serving stale cache "+logContext, append(logArgs, "status", resp.StatusCode)...)
			return &githubFetchResult{
				Body:        stale.body,
				StatusCode:  stale.statusCode,
				ContentType: stale.contentType,
				CacheStatus: cacheStatusStale,
			}, nil
		}
		return &githubFetchResult{StatusCode: resp.StatusCode}, fmt.Errorf("GitHub API rate limit exceeded — no cached data available")
	}

	if stale := h.cache.getStale(cacheKey, missionsCacheStaleTTL); stale != nil {
		slog.Error("[missions] upstream error after retries, serving stale cache "+logContext, append(logArgs, "error", err)...)
		return &githubFetchResult{
			Body:        stale.body,
			StatusCode:  stale.statusCode,
			ContentType: stale.contentType,
			CacheStatus: cacheStatusStale,
		}, nil
	}
	var statusCode = http.StatusBadGateway
	if resp != nil && resp.StatusCode > 0 {
		statusCode = resp.StatusCode
	}
	return &githubFetchResult{StatusCode: statusCode}, fmt.Errorf("upstream request failed")
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
	url := fmt.Sprintf("%s/repos/kubestellar/console-kb/contents/%s?ref=master", h.githubAPIURL, path)

	res, err := h.fetchWithCache(c, cacheKey, url, "(browse)", "path", path)
	if err != nil {
		if res == nil {
			return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
		}
		if res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusTooManyRequests {
			return c.Status(res.StatusCode).JSON(fiber.Map{
				"error":  err.Error(),
				"status": res.StatusCode,
				"code":   "rate_limited",
			})
		}
		status := http.StatusBadGateway
		if res != nil && res.StatusCode > 0 {
			status = res.StatusCode
		}
		return c.Status(status).JSON(fiber.Map{"error": err.Error()})
	}

	if res.CacheStatus != cacheStatusMiss {
		c.Set("Content-Type", res.ContentType)
		c.Set("X-Cache", string(res.CacheStatus))
		return c.Status(res.StatusCode).Send(res.Body)
	}

	if res.StatusCode != http.StatusOK {
		code := "github_error"
		if res.StatusCode == http.StatusUnauthorized {
			code = "token_invalid"
		}
		return c.Status(res.StatusCode).JSON(fiber.Map{"error": "GitHub API error", "status": res.StatusCode, "code": code})
	}

	body := res.Body

	// GitHub returns type:"dir", frontend expects type:"directory" — transform.
	// #6818 — If the path points to a file (not a directory), GitHub returns a
	// JSON object instead of an array. json.Unmarshal into a slice will fail.
	// Previously the handler forwarded the raw GitHub body, which has a
	// different shape ({name, path, type:"file", content, ...}) than the
	// normalized [{name, path, type, size}] the frontend expects — causing
	// BrowseMissions to crash when it tries to .map() over an object. Return
	// a structured 400 error instead, and skip the cache so subsequent
	// requests with the corrected path aren't penalized.
	// #7134 — GitHub returns a JSON object for single files and a JSON array
	// for directories. Previously the handler returned a 400 error when the
	// response was an object, crashing frontend iterators. Now we attempt to
	// unmarshal as an array first; if that fails, try a single object and wrap
	// it in an array so the frontend always receives a consistent shape.
	var ghEntries []map[string]interface{}
	if err := json.Unmarshal(body, &ghEntries); err != nil {
		var single map[string]interface{}
		if singleErr := json.Unmarshal(body, &single); singleErr != nil {
			return c.Status(400).JSON(fiber.Map{
				"error": "path is a file, not a directory",
				"code":  "not_a_directory",
			})
		}
		ghEntries = []map[string]interface{}{single}
	}

	// Files and directories to hide from the browser UI — infrastructure
	// and metadata entries that are not missions and would confuse users.
	// #6421 — Any dot-prefixed entry is hidden by the dotfile check below,
	// so this map only needs to cover non-dot files.
	hiddenFiles := map[string]bool{
		"index.json":       true,
		"search-state.json": true,
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
		// #6421 — Skip any dotfile/dotdir (standard hidden-entry convention).
		// This is intentionally exhaustive rather than an allowlist so that
		// newly-added infrastructure dirs (.gitlab, .vscode, .well-known…)
		// don't leak into the mission browser UI automatically.
		if strings.HasPrefix(name, ".") {
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
		slog.Info("[missions] cache MISS, stored (browse)", "path", path)
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
	url := fmt.Sprintf("%s/kubestellar/console-kb/%s/%s", h.githubRawURL, ref, path)

	res, err := h.fetchWithCache(c, cacheKey, url, "(file)", "ref", ref, "path", path)
	if err != nil {
		if res == nil {
			return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": err.Error()})
		}
		if res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusTooManyRequests {
			return c.Status(res.StatusCode).JSON(fiber.Map{
				"error":  err.Error(),
				"status": res.StatusCode,
				"code":   "rate_limited",
			})
		}
		status := http.StatusBadGateway
		if res != nil && res.StatusCode > 0 {
			status = res.StatusCode
		}
		return c.Status(status).JSON(fiber.Map{"error": err.Error()})
	}

	if res.CacheStatus != cacheStatusMiss {
		c.Set("Content-Type", res.ContentType)
		c.Set("X-Cache", string(res.CacheStatus))
		return c.Status(res.StatusCode).Send(res.Body)
	}

	if res.StatusCode == http.StatusNotFound {
		return c.Status(404).JSON(fiber.Map{"error": "file not found"})
	}
	if res.StatusCode != http.StatusOK {
		return c.Status(res.StatusCode).JSON(fiber.Map{"error": "GitHub raw content error"})
	}

	// Cache the successful response
	h.cache.set(cacheKey, &missionsCacheEntry{
		body:        res.Body,
		contentType: "text/plain",
		statusCode:  http.StatusOK,
		fetchedAt:   time.Now(),
	})
	slog.Info("[missions] cache MISS, stored (file)", "ref", ref, "path", path, "bytes", len(res.Body))

	c.Set("Content-Type", "text/plain")
	c.Set("X-Cache", "MISS")
	return c.Status(res.StatusCode).Send(res.Body)
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
	// Use the tighter missionsValidateMaxBytes instead of the general
	// missionsMaxBodyBytes — mission JSON metadata is always small (#6820).
	if len(body) > missionsValidateMaxBytes {
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

// ---------- Score Exposure ----------

type indexJsonFormat struct {
	Version  int `json:"version"`
	Count    int `json:"count"`
	Missions []struct {
		Path               string      `json:"path"`
		Title              string      `json:"title"`
		Description        string      `json:"description"`
		QualityScore       *int        `json:"qualityScore"`
		QualityPass        *bool       `json:"qualityPass"`
		QualityIssues      []string    `json:"qualityIssues"`
		QualitySuggestions []string    `json:"qualitySuggestions"`
		QualityBreakdown   interface{} `json:"qualityBreakdown"`
		CncfProjects       []string    `json:"cncfProjects"`
	} `json:"missions"`
}

func (h *MissionsHandler) fetchMissionIndex(c *fiber.Ctx) (*indexJsonFormat, error) {
	cacheKey := "index:master:fixes/index.json"
	url := fmt.Sprintf("%s/kubestellar/console-kb/master/fixes/index.json", h.githubRawURL)

	res, err := h.fetchWithCache(c, cacheKey, url, "(index json)")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch index: %v", err)
	}

	var body = res.Body
	if res.CacheStatus == cacheStatusMiss {
		if res.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("GitHub raw content error")
		}

		h.cache.set(cacheKey, &missionsCacheEntry{
			body:        res.Body,
			contentType: "application/json",
			statusCode:  http.StatusOK,
			fetchedAt:   time.Now(),
		})
		slog.Info("[missions] cache MISS, stored (index json)", "bytes", len(res.Body))
	}

	var index indexJsonFormat
	if err := json.Unmarshal(body, &index); err != nil {
		slog.Error("[missions] failed to parse index json", "error", err)
		return nil, fmt.Errorf("failed to parse index")
	}
	return &index, nil
}

// GetKBScores fetches scores across projects
// GET /api/missions/scores
func (h *MissionsHandler) GetKBScores(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{"count": 1, "scores": []fiber.Map{
			{
				"path":         "fixes/demo/demo-123.json",
				"title":        "Demo Mission",
				"project":      "demo",
				"qualityScore": 85,
				"qualityPass":  true,
			},
		}})
	}
	index, err := h.fetchMissionIndex(c)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": err.Error()})
	}

	// Filter just the scoring related fields
	results := make([]fiber.Map, 0)
	for _, m := range index.Missions {
		if m.QualityScore != nil {
			project := "unknown"
			if len(m.CncfProjects) > 0 {
				project = m.CncfProjects[0]
			}
			results = append(results, fiber.Map{
				"path":         m.Path,
				"title":        m.Title,
				"project":      project,
				"qualityScore": m.QualityScore,
				"qualityPass":  m.QualityPass,
			})
		}
	}

	return c.JSON(fiber.Map{"count": len(results), "scores": results})
}

// GetMissionScore fetches score breakdown for a specific entry
// GET /api/missions/scores/:project/:id
func (h *MissionsHandler) GetMissionScore(c *fiber.Ctx) error {
	if isDemoMode(c) {
		return c.JSON(fiber.Map{
			"path":               "fixes/demo/demo-123.json",
			"project":            "demo",
			"title":              "Demo Mission",
			"qualityScore":       85,
			"qualityBreakdown":   map[string]interface{}{"structure": 90, "completeness": 80},
			"qualityIssues":      []string{},
			"qualitySuggestions": []string{"Improve context"},
		})
	}

	project := c.Params("project")
	id := c.Params("id")

	index, err := h.fetchMissionIndex(c)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": err.Error()})
	}

	for _, m := range index.Missions {
		mProject := "unknown"
		if len(m.CncfProjects) > 0 {
			mProject = m.CncfProjects[0]
		}
		// Match by project and filename. Accept both "foo" and "foo.json" from
		// callers so URL construction on the frontend is flexible.
		mBase := path.Base(m.Path)
		if mProject == project && (strings.TrimSuffix(mBase, ".json") == strings.TrimSuffix(id, ".json")) {
			if m.QualityScore == nil {
				return c.Status(404).JSON(fiber.Map{"error": "Mission found but has no score associated"})
			}
			return c.JSON(fiber.Map{
				"path":               m.Path,
				"project":            mProject,
				"title":              m.Title,
				"qualityScore":       m.QualityScore,
				"qualityBreakdown":   m.QualityBreakdown,
				"qualityIssues":      m.QualityIssues,
				"qualitySuggestions": m.QualitySuggestions,
			})
		}
	}

	return c.Status(404).JSON(fiber.Map{"error": "KB mission not found"})
}

// ---------- Share to Slack ----------

// SlackShareRequest is the payload for sharing a mission to Slack.
type SlackShareRequest struct {
	WebhookURL string `json:"webhookUrl"`
	Text       string `json:"text"`
}

// validSlackWebhookHost is the ONLY host a Slack incoming webhook URL may
// point at. Any other host is a potential SSRF target (see #6416).
const validSlackWebhookHost = "hooks.slack.com"

// validSlackWebhookPathPrefix is the required path prefix for a real Slack
// incoming webhook — anything else is either a misconfiguration or an
// attempt to proxy the request elsewhere.
const validSlackWebhookPathPrefix = "/services/"

// validateSlackWebhookURL parses the given URL and enforces a strict
// allowlist: HTTPS only, host MUST equal hooks.slack.com (no subdomain or
// userinfo tricks), and path MUST start with /services/. Returns an error
// describing the rejection reason, or nil if the URL is safe.
//
// SECURITY (#6416): The previous check used
// `strings.HasPrefix(url, "https://hooks.slack.com/")` which accepted
// several bypass shapes depending on how URL parsers canonicalize the
// request:
//   - `https://hooks.slack.com/@attacker.evil/` — rejected by prefix but
//     the HasPrefix check is still structural, not semantic, so any
//     addition of URL grammar (userinfo, fragments, etc.) risks bypass
//     when the parser normalizes.
//   - `https://hooks.slack.com\\@attacker.evil/` — backslash is a
//     separator in some parsers (WHATWG) but not Go's net/url, producing
//     host mismatches across components.
//   - `https://hooks.slack.com/` followed by an open redirect path — not
//     strictly an SSRF but exfiltrates the webhook token.
//
// Parsing explicitly and comparing parsed.Host to the literal allowed
// host eliminates the whole class of prefix-based bypasses.
func validateSlackWebhookURL(rawURL string) error {
	if rawURL == "" {
		return fmt.Errorf("webhook URL is required")
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("webhook URL is not a valid URL")
	}
	if parsed.Scheme != "https" {
		return fmt.Errorf("webhook URL must use https")
	}
	// User info (user:pass@host) is never valid for a Slack webhook and is
	// the most common SSRF smuggling shape — reject outright.
	if parsed.User != nil {
		return fmt.Errorf("webhook URL must not include userinfo")
	}
	// Host must match EXACTLY; no subdomains, no suffix tricks. Hostname()
	// strips any port, which Slack never uses, but we guard against that
	// below anyway by rejecting non-empty Port().
	if parsed.Hostname() != validSlackWebhookHost {
		return fmt.Errorf("webhook URL host must be %s", validSlackWebhookHost)
	}
	if parsed.Port() != "" {
		return fmt.Errorf("webhook URL must not specify a port")
	}
	if !strings.HasPrefix(parsed.Path, validSlackWebhookPathPrefix) {
		return fmt.Errorf("webhook URL path must begin with %s", validSlackWebhookPathPrefix)
	}
	return nil
}

// ShareToSlack posts a message to a Slack webhook.
// POST /api/missions/share/slack
func (h *MissionsHandler) ShareToSlack(c *fiber.Ctx) error {
	var req SlackShareRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if err := validateSlackWebhookURL(req.WebhookURL); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": err.Error()})
	}
	if req.Text == "" {
		return c.Status(400).JSON(fiber.Map{"error": "text is required"})
	}
	// #6817 — Cap outbound Slack message size. Without this, a caller can
	// POST a multi-MB text body that gets serialized into the Slack webhook
	// payload and buffered in-process.
	if len(req.Text) > slackMaxTextBytes {
		return c.Status(400).JSON(fiber.Map{"error": fmt.Sprintf("text exceeds maximum size (%d bytes)", slackMaxTextBytes)})
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
		// #6817 — Drain the response body before returning so the underlying
		// TCP connection can be reused by the transport pool. defer Close()
		// alone does not guarantee the body is fully consumed.
		_, _ = io.Copy(io.Discard, resp.Body)
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

	// #6419 — Reject oversized payloads before parsing. A misbehaving or
	// malicious client could post up to missionsMaxBodyBytes (10 MiB) of
	// base64-encoded content, which the handler would then hold in memory
	// while making 4 sequential GitHub API calls (fork, ref, commit, PR)
	// with missionsAPITimeout (30s) each — pinning a goroutine for up to
	// two minutes per request. Cap the share endpoint at
	// missionsGitHubShareMaxBytes (1 MiB), which is more than enough for
	// a kc-mission-v1 JSON document.
	if len(c.Body()) > missionsGitHubShareMaxBytes {
		return c.Status(fiber.StatusRequestEntityTooLarge).JSON(fiber.Map{
			"error":   "payload too large",
			"maxSize": missionsGitHubShareMaxBytes,
		})
	}

	var req GitHubShareRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.Repo == "" || req.FilePath == "" || req.Content == "" || req.Branch == "" {
		return c.Status(400).JSON(fiber.Map{"error": "repo, filePath, content, and branch are required"})
	}

	// SECURITY #6439 — Enforce an allowlist on req.Repo. Without this, a
	// misbehaving client could supply any owner/repo value and use the
	// handler as a confused-deputy PR-creation service against whatever
	// repositories the caller's PAT can write to. The default allowlist
	// contains only `kubestellar/console-kb` (the canonical destination for
	// shared missions); operators can append more via KC_ALLOWED_SHARE_REPOS.
	//
	// #6453(A) — Resolve the allowlist exactly ONCE per request and reuse it
	// for both the membership check and the error-response payload. The
	// previous version called resolveAllowedShareRepos() twice on the reject
	// path, duplicating env parsing and creating a small race window where
	// the error message could disagree with the check if KC_ALLOWED_SHARE_REPOS
	// changed between the two calls.
	allowedShareRepos := resolveAllowedShareRepos()
	if !isRepoAllowedForShareWithList(req.Repo, allowedShareRepos) {
		return c.Status(400).JSON(fiber.Map{
			"error":         "repo is not on the share allowlist",
			"allowed_repos": allowedShareRepos,
		})
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
	forkReq.Header.Set("Content-Type", "application/json") // #7133 — required by GitHub API
	forkResp, err := h.httpClient.Do(forkReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to fork repo"})
	}
	defer forkResp.Body.Close()

	if forkResp.StatusCode < 200 || forkResp.StatusCode >= 300 {
		// #7137 — Drain response body so the TCP connection returns to the pool.
		io.Copy(io.Discard, forkResp.Body) //nolint:errcheck // best-effort drain
		return c.Status(502).JSON(fiber.Map{"error": fmt.Sprintf("GitHub fork failed with status %d", forkResp.StatusCode)})
	}
	var forkData map[string]interface{}
	if err := json.NewDecoder(forkResp.Body).Decode(&forkData); err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to decode fork response"})
	}
	forkFullName, _ := forkData["full_name"].(string)
	if forkFullName == "" || !strings.Contains(forkFullName, "/") {
		return c.Status(502).JSON(fiber.Map{"error": "fork response missing or malformed full_name"})
	}

	// Detect the target repo's default branch (e.g. "main", "master", or custom).
	// The fork response includes the parent's default_branch, but we also fall back
	// to querying the upstream repo directly if the field is missing.
	defaultBranch := "main"
	if parent, ok := forkData["parent"].(map[string]interface{}); ok {
		if db, ok := parent["default_branch"].(string); ok && db != "" {
			defaultBranch = db
		}
	} else if db, ok := forkData["default_branch"].(string); ok && db != "" {
		defaultBranch = db
	}

	// #7135 — Always query the upstream repo for its default branch. The fork
	// response's parent.default_branch or default_branch fields may disagree
	// with the actual upstream value (e.g. a fork created before a rename from
	// "master" to "main"). Querying the upstream is the only reliable source.
	// Previously this only fired when defaultBranch == "main", missing repos
	// that use "master", "trunk", or other non-default names (#6795).
	{
		upstreamURL := fmt.Sprintf("%s/repos/%s", h.githubAPIURL, req.Repo)
		upstreamReq, err := http.NewRequest("GET", upstreamURL, nil)
		if err == nil {
			upstreamReq.Header.Set("Authorization", "Bearer "+token)
			upstreamReq.Header.Set("Accept", "application/vnd.github.v3+json")
			upstreamResp, err := h.httpClient.Do(upstreamReq)
			if err == nil {
				defer upstreamResp.Body.Close()
				if upstreamResp.StatusCode == http.StatusOK {
					var repoData map[string]interface{}
					if json.NewDecoder(upstreamResp.Body).Decode(&repoData) == nil {
						if db, ok := repoData["default_branch"].(string); ok && db != "" {
							defaultBranch = db
						}
					}
				} else {
					// #7137 — Drain on non-200 so TCP connection is reused.
					io.Copy(io.Discard, upstreamResp.Body) //nolint:errcheck
				}
			}
		}
	}

	// Step 2: Get HEAD SHA from fork's default branch, then create new branch ref.
	// After fork creation, GitHub may not have the ref ready immediately (#2382).
	// Retry with exponential backoff to handle this race condition.
	mainRefURL := fmt.Sprintf("%s/repos/%s/git/ref/heads/%s", h.githubAPIURL, forkFullName, defaultBranch)
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

		refData, decodeErr := func() (map[string]interface{}, error) {
			defer mainRefResp.Body.Close()
			var data map[string]interface{}
			err := json.NewDecoder(mainRefResp.Body).Decode(&data)
			return data, err
		}()
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

		// If this is not the last attempt, wait before retrying.
		// Use select with context cancellation so the retry is
		// abortable when the client disconnects (#6819).
		if attempt < forkHeadSHAMaxRetries-1 {
			slog.Info("[missions] fork HEAD SHA not yet available, retrying",
				"attempt", attempt+1, "maxRetries", forkHeadSHAMaxRetries, "status", mainRefResp.StatusCode, "backoff", backoff)
			select {
			case <-time.After(backoff):
				// backoff elapsed, continue to next attempt
			case <-c.UserContext().Done():
				return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
					"error": "request cancelled while waiting for fork to initialize",
					"code":  "request_cancelled",
				})
			}
			backoff = time.Duration(float64(backoff) * forkHeadSHABackoffMultiplier)
		}
	}
	if headSHA == "" {
		// #6420 — After exhausting the retry budget, return 504 Gateway
		// Timeout instead of 502. 504 is the correct status for "upstream
		// didn't respond in time"; 502 implies the upstream returned an
		// error response, which isn't the case here (we got 404 or 200
		// without an object SHA). The frontend should retry this specific
		// error (eventual consistency) rather than surfacing it as a hard
		// failure.
		return c.Status(fiber.StatusGatewayTimeout).JSON(fiber.Map{
			"error": fmt.Sprintf("could not resolve HEAD SHA for fork's %s branch after retries; GitHub fork is still initializing — retry in a few seconds", defaultBranch),
			"code":  "fork_not_ready",
		})
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
	refReq.Header.Set("Content-Type", "application/json") // #7133 — required by GitHub API
	branchResp, err := h.httpClient.Do(refReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to create branch ref"})
	}
	defer branchResp.Body.Close()
	if branchResp.StatusCode < 200 || branchResp.StatusCode >= 300 {
		// 422 (Unprocessable Entity) means the branch already exists, which is acceptable.
		// #6835 — Eagerly drain the response body so the underlying HTTP/1.1
		// connection is returned to the pool immediately instead of waiting for
		// the deferred Close at function return (which may be 3+ HTTP calls later).
		io.Copy(io.Discard, branchResp.Body) //nolint:errcheck // best-effort drain
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
	fileReq.Header.Set("Content-Type", "application/json") // #6842 — required by GitHub Contents API
	fileResp, err := h.httpClient.Do(fileReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to commit file"})
	}
	defer fileResp.Body.Close()

	// Validate commit response status (#2384) and content (#2381)
	if fileResp.StatusCode < 200 || fileResp.StatusCode >= 300 {
		// #7137 — Drain response body so the TCP connection returns to the pool.
		io.Copy(io.Discard, fileResp.Body) //nolint:errcheck // best-effort drain
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
		"head":  strings.SplitN(forkFullName, "/", 2)[0] + ":" + req.Branch, // #7138 — SplitN guards against missing "/"
		"base":  defaultBranch,
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
	prReq.Header.Set("Content-Type", "application/json") // #7133 — required by GitHub API
	prResp, err := h.httpClient.Do(prReq)
	if err != nil {
		return c.Status(502).JSON(fiber.Map{"error": "failed to create PR"})
	}
	defer prResp.Body.Close()

	// Validate PR creation response (#2384)
	if prResp.StatusCode < 200 || prResp.StatusCode >= 300 {
		// #7137 — Drain response body so the TCP connection returns to the pool.
		io.Copy(io.Discard, prResp.Body) //nolint:errcheck // best-effort drain
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

	// #9890: persist audit entry after successful external PR creation.
	audit.Log(c, audit.ActionShareMissionGitHub, "mission", req.FilePath,
		fmt.Sprintf("repo=%s branch=%s fork=%s pr=%s", req.Repo, req.Branch, forkFullName, prHTMLURL))

	return c.JSON(fiber.Map{
		"success": true,
		"pr_url":  prHTMLURL,
		"fork":    forkFullName,
	})
}
