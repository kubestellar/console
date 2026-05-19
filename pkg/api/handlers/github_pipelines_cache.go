package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/kubestellar/console/pkg/client"
	"golang.org/x/sync/singleflight"
)

// GitHubPipelinesHandler serves /api/github-pipelines.
type GitHubPipelinesHandler struct {
	token         string
	mutationToken string
	httpClient    *http.Client
	history       *ghpHistory

	mu       sync.RWMutex
	cache    map[string]ghpCacheEntry
	fetchGrp singleflight.Group
}

// NewGitHubPipelinesHandler constructs the handler. `githubToken` is the
// read-only PAT. Mutation token comes from GITHUB_MUTATIONS_TOKEN env var
// — if unset, mutations return 503.
func NewGitHubPipelinesHandler(githubToken string) *GitHubPipelinesHandler {
	return &GitHubPipelinesHandler{
		token:         githubToken,
		mutationToken: os.Getenv("GITHUB_MUTATIONS_TOKEN"),
		httpClient:    client.GitHub,
		history:       newGHPHistory(),
		cache:         make(map[string]ghpCacheEntry),
	}
}

func (h *GitHubPipelinesHandler) cacheKey(c *fiber.Ctx) string {
	view := c.Query("view", "pulse")
	datePrefix := ""
	if view == "pulse" {
		datePrefix = time.Now().UTC().Format("2006-01-02T15")
	}
	return fmt.Sprintf("%s:%s:%s:%s:%s",
		view,
		datePrefix,
		c.Query("repo", "all"),
		c.Query("days"),
		c.Query("job"),
	)
}

func (h *GitHubPipelinesHandler) serveCached(c *fiber.Ctx, key string, build func(c *fiber.Ctx) (any, error)) error {
	maxAge := int64(ghpCacheTTL.Seconds())
	if maxAge < 0 {
		maxAge = 0
	}

	h.mu.RLock()
	entry, ok := h.cache[key]
	h.mu.RUnlock()
	if ok && time.Now().Before(entry.exp) {
		c.Set("X-Cache", "HIT")
		c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
		c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
		return c.Send(entry.body)
	}

	v, err, _ := h.fetchGrp.Do(key, func() (any, error) {
		// Detach from the triggering HTTP request context so the fetch
		// survives if the caller disconnects.  Singleflight coalesces
		// concurrent callers; if the "winner" disconnects, a request-tied
		// context would cancel the in-flight GitHub API calls for everyone.
		detachedCtx, cancel := context.WithTimeout(context.Background(), ghpFetchTimeout)
		defer cancel()
		origCtx := c.UserContext()
		c.SetUserContext(detachedCtx)
		defer c.SetUserContext(origCtx)
		return build(c)
	})
	if err != nil {
		if stale := h.getStale(key); stale != nil {
			slog.Info("[github-pipelines] serving stale cache on error", "key", key, "error", err)
			c.Set("X-Cache", "STALE")
			c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
			c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
			return c.Send(stale.body)
		}
		status := fiber.StatusBadGateway
		genericMsg := "failed to fetch pipeline data"
		if err.Error() == "unknown repo" {
			status = fiber.StatusBadRequest
			genericMsg = "unknown repo"
		}
		slog.Error("[GitHubPipelines] fetch failed", "error", err)
		return c.Status(status).JSON(fiber.Map{"error": genericMsg})
	}

	inner, err := json.Marshal(v)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "marshal failed"})
	}
	reposJSON, err := json.Marshal(ghpRepos)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "repos marshal failed"})
	}
	body := make([]byte, 0)
	if len(inner) > 2 && inner[0] == '{' {
		const ghpMaxMergedBodyBytes = 100 * 1024 * 1024
		mergedSize := len(inner) + len(reposJSON) + 12
		if mergedSize > ghpMaxMergedBodyBytes || mergedSize < 0 {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "response too large"})
		}
		body = make([]byte, 0, mergedSize)
		body = append(body, inner[:len(inner)-1]...)
		body = append(body, `,"repos":`...)
		body = append(body, reposJSON...)
		body = append(body, '}')
	} else {
		body = inner
	}

	h.mu.Lock()
	h.cache[key] = ghpCacheEntry{body: body, exp: time.Now().Add(ghpCacheTTL)}
	h.mu.Unlock()
	c.Set("X-Cache", "MISS")
	c.Set(fiber.HeaderContentType, fiber.MIMEApplicationJSON)
	c.Set(fiber.HeaderCacheControl, fmt.Sprintf("public, max-age=%d", maxAge))
	if headers, ok := c.UserContext().Value(ghpRateLimitHeadersKey).(map[string]string); ok {
		for k, v := range headers {
			c.Set(k, v)
		}
	}
	return c.Send(body)
}

// getStale returns a cached entry even if expired, as long as it is within ghpCacheStaleTTL.
// Used to serve stale data when GitHub rate-limits us — better than an error.
func (h *GitHubPipelinesHandler) getStale(key string) *ghpCacheEntry {
	h.mu.RLock()
	defer h.mu.RUnlock()
	entry, ok := h.cache[key]
	if !ok {
		return nil
	}
	staleCutoff := entry.exp.Add(-ghpCacheTTL).Add(ghpCacheStaleTTL)
	if time.Now().After(staleCutoff) {
		return nil
	}
	cp := entry
	return &cp
}

// ghpStoreRateLimitHeaders stores GitHub API rate limit headers in the context
// for later forwarding to the client response.
func ghpStoreRateLimitHeaders(ctx context.Context, resp *http.Response) context.Context {
	headers := make(map[string]string)
	for _, header := range []string{
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
		"X-RateLimit-Used",
	} {
		if v := resp.Header.Get(header); v != "" {
			headers[header] = v
		}
	}
	if len(headers) > 0 {
		return context.WithValue(ctx, ghpRateLimitHeadersKey, headers)
	}
	return ctx
}

// ghpForwardRateLimitHeaders forwards GitHub API rate limit headers from
// the context to the fiber response.
func ghpForwardRateLimitHeaders(c *fiber.Ctx, resp *http.Response) {
	for _, header := range []string{
		"X-RateLimit-Limit",
		"X-RateLimit-Remaining",
		"X-RateLimit-Reset",
		"X-RateLimit-Used",
	} {
		if v := resp.Header.Get(header); v != "" {
			c.Set(header, v)
		}
	}
}
