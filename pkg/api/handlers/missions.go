package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/client"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/settings"
	"github.com/kubestellar/console/pkg/store"
)

// NewMissionsHandler creates a new MissionsHandler with default settings.
func NewMissionsHandler() *MissionsHandler {
	return &MissionsHandler{
		httpClient:   client.External,
		githubAPIURL: "https://api.github.com",
		githubRawURL: "https://raw.githubusercontent.com",
		cache:        &missionsResponseCache{entries: make(map[string]*missionsCacheEntry)},
	}
}

// WithStore attaches a store for KB query gap tracking and returns the handler
// for chaining. Safe to omit — gap tracking is a no-op when store is nil.
func (h *MissionsHandler) WithStore(s store.Store) *MissionsHandler {
	h.store = s
	return h
}

// RegisterRoutes registers all mission routes on the given Fiber router group.
func (h *MissionsHandler) RegisterRoutes(g fiber.Router) {
	g.Post("/validate", h.ValidateMission)
	g.Post("/share/slack", h.ShareToSlack)
	g.Post("/share/github", h.ShareToGitHub)
	g.Get("/gaps", h.GetKBGaps)
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
		slog.Warn("[missions] invalid path parameter", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid path parameter"})
	}
	if err := validateKBBrowsePath(path); err != nil {
		slog.Warn("[missions] rejected browse path", "path", path, "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid path parameter"})
	}
	url := fmt.Sprintf("%s/repos/kubestellar/console-kb/contents/%s?ref=master", h.githubAPIURL, path)
	cacheKey := "browse:" + path

	res, err := h.fetchWithCache(c, cacheKey, url, "(browse)", "path", path)
	if err != nil {
		if res == nil {
			slog.Error("[missions] upstream fetch failed (browse)", "path", path, "error", err)
			return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": "upstream request failed"})
		}
		if res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusTooManyRequests {
			slog.Warn("[missions] upstream rate limited (browse)", "path", path, "status", res.StatusCode, "error", err)
			return c.Status(res.StatusCode).JSON(fiber.Map{
				"error":  "upstream rate limited",
				"status": res.StatusCode,
				"code":   "rate_limited",
			})
		}
		status := http.StatusBadGateway
		if res != nil && res.StatusCode > 0 {
			status = res.StatusCode
		}
		slog.Error("[missions] upstream request failed (browse)", "path", path, "status", status, "error", err)
		return c.Status(status).JSON(fiber.Map{"error": "upstream request failed"})
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
	ghEntries := make([]map[string]interface{}, 0)
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
		"index.json":        true,
		"search-state.json": true,
	}

	entries := make([]fiber.Map, 0, len(ghEntries))
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

	// Record zero-result browse paths for the KB gap tracker.
	// Fires asynchronously so it never delays the response.
	if len(entries) == 0 && h.store != nil {
		safego.GoWith("kb-gap-record", func() {
			if err := h.store.RecordKBGap(context.Background(), path); err != nil {
				slog.Warn("[missions] failed to record KB gap", "path", path, "error", err)
			}
		})
	}

	c.Set("X-Cache", "MISS")
	return c.JSON(entries)
}

// GetKBGaps returns the top zero-result KB browse paths, ordered by hit count.
// GET /api/missions/gaps?limit=20
func (h *MissionsHandler) GetKBGaps(c *fiber.Ctx) error {
	if h.store == nil {
		return c.JSON(fiber.Map{"gaps": []store.KBQueryGap{}, "count": 0, "source": "disabled"})
	}
	if err := requireAdmin(c, h.store); err != nil {
		return err
	}

	limit := c.QueryInt("limit", kbGapsDefaultLimit)
	gaps, err := h.store.ListTopKBGaps(c.Context(), limit)
	if err != nil {
		slog.Error("[missions] failed to list KB gaps", "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "failed to retrieve KB gaps")
	}

	return c.JSON(fiber.Map{
		"gaps":  gaps,
		"count": len(gaps),
	})
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
		slog.Warn("[missions] invalid path parameter", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid path parameter"})
	}
	rawRef := c.Query("ref", "master")
	ref, err := sanitizeRef(rawRef)
	if err != nil {
		slog.Warn("[missions] invalid ref parameter", "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid ref parameter"})
	}

	cacheKey := "file:" + ref + ":" + path
	url := fmt.Sprintf("%s/kubestellar/console-kb/%s/%s", h.githubRawURL, ref, path)

	res, err := h.fetchWithCache(c, cacheKey, url, "(file)", "ref", ref, "path", path)
	if err != nil {
		if res == nil {
			slog.Error("[missions] upstream fetch failed (file)", "ref", ref, "path", path, "error", err)
			return c.Status(http.StatusBadGateway).JSON(fiber.Map{"error": "upstream request failed"})
		}
		if res.StatusCode == http.StatusForbidden || res.StatusCode == http.StatusTooManyRequests {
			slog.Warn("[missions] upstream rate limited (file)", "ref", ref, "path", path, "status", res.StatusCode, "error", err)
			return c.Status(res.StatusCode).JSON(fiber.Map{
				"error":  "upstream rate limited",
				"status": res.StatusCode,
				"code":   "rate_limited",
			})
		}
		status := http.StatusBadGateway
		if res != nil && res.StatusCode > 0 {
			status = res.StatusCode
		}
		slog.Error("[missions] upstream request failed (file)", "ref", ref, "path", path, "status", status, "error", err)
		return c.Status(status).JSON(fiber.Map{"error": "upstream request failed"})
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

	var req validateMissionRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": []string{"invalid JSON format"}})
	}
	if len(req.Mission) == 0 {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": []string{"mission is required"}})
	}
	req.Path = strings.TrimSpace(req.Path)
	if req.Path == "" {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": []string{"path is required"}})
	}

	var mission MissionSpec
	if err := json.Unmarshal(req.Mission, &mission); err != nil {
		return c.Status(400).JSON(fiber.Map{"valid": false, "errors": []string{"invalid mission JSON format"}})
	}

	errs := make([]string, 0)
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

	index, err := h.fetchMissionIndex(c)
	if err != nil {
		slog.Error("[missions] failed to fetch mission index (validate)", "error", err)
		return c.Status(502).JSON(fiber.Map{"error": "failed to fetch mission index"})
	}

	for _, entry := range index.Missions {
		if entry.Path != req.Path {
			continue
		}
		if entry.QualityPass != nil && !*entry.QualityPass {
			qualityErrs := append([]string(nil), entry.QualityIssues...)
			if len(qualityErrs) == 0 {
				qualityErrs = []string{"Mission failed nightly KB validation"}
			}
			return c.Status(http.StatusUnprocessableEntity).JSON(fiber.Map{
				"valid":        false,
				"qualityPass":  false,
				"qualityScore": entry.QualityScore,
				"testedOn":     entry.TestedOn,
				"errors":       qualityErrs,
			})
		}
		return c.JSON(fiber.Map{
			"valid":        true,
			"qualityPass":  entry.QualityPass,
			"qualityScore": entry.QualityScore,
			"testedOn":     entry.TestedOn,
		})
	}

	return c.Status(http.StatusUnprocessableEntity).JSON(fiber.Map{
		"valid":  false,
		"errors": []string{"Mission not found in validated KB index"},
	})
}
