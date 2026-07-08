package handlers

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/ssrf"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

// ──────────────────────────────────────────────────────────────────────────────
// Card Proxy — allows Tier 2 custom cards to fetch external API data
// safely through the backend, avoiding CORS issues and keeping the sandbox
// secure (fetch/XMLHttpRequest remain blocked in the card scope).
// ──────────────────────────────────────────────────────────────────────────────

const (
	// cardProxyTimeout is the max duration for a proxied card request.
	cardProxyTimeout = 15 * time.Second

	// cardProxyMaxResponseBytes caps the response body to prevent memory abuse.
	// 5 MB is generous for JSON API responses.
	cardProxyMaxResponseBytes = 5 * 1024 * 1024

	// cardProxyMaxURLLen prevents abuse via extremely long URLs.
	cardProxyMaxURLLen = 2048

	// cardProxyRateWindow is the sliding window for per-user rate limiting.
	cardProxyRateWindow = 1 * time.Minute

	// cardProxyRateMax is the maximum requests per user per window.
	cardProxyRateMax = 30

	// cardProxyMaxBuckets caps the worst-case map size to prevent unbounded growth.
	cardProxyMaxBuckets = 10000

	// cardProxyLimiterIdleTTL is the idle timeout before evicting a rate limiter entry.
	cardProxyLimiterIdleTTL = 10 * time.Minute

	// cardProxyEvictionInterval is how often to run the eviction goroutine.
	cardProxyEvictionInterval = 5 * time.Minute
)


// cardProxyClient uses a custom DialContext to check resolved IPs at
// connection time, preventing DNS rebinding / TOCTOU SSRF bypasses.
var cardProxyClient = &http.Client{
	Timeout: cardProxyTimeout,
	CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
		return http.ErrUseLastResponse
	},
	Transport: &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}
			if len(ips) == 0 {
				return nil, fmt.Errorf("no IPs resolved for host %s", host)
			}
			for _, ip := range ips {
				if isBlockedIP(ip.IP) {
					return nil, fmt.Errorf("blocked: non-public IP %s for host %s", ip.IP, host)
				}
			}
			// Connect to the first validated IP directly — no second DNS lookup
			dialer := &net.Dialer{Timeout: cardProxyTimeout}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	},
}

// isBlockedIP delegates to the shared SSRF validation package to keep
// IP-blocking logic in one place (#18372).
func isBlockedIP(ip net.IP) bool {
	return ssrf.IsBlockedIP(ip)
}

// CardProxyHandler proxies external HTTP GET requests for custom card code.
// Cards call useCardFetch(url) in the sandbox, which routes through this
// endpoint: GET /api/card-proxy?url=<encoded-url>
type CardProxyHandler struct {
	store   store.Store
	limiter *cardProxyRateLimiter
}

// cardProxyRateLimiter tracks per-user request counts in a sliding window.
type cardProxyRateLimiter struct {
	mu           sync.Mutex
	buckets      map[string]*rateBucket
	evictStarted bool
}

type rateBucket struct {
	count    int
	window   time.Time
	lastUsed time.Time
}

// cardProxyEvictCtx / cardProxyEvictCancel provide context-based cancellation
// for the background evictor goroutine.
var (
	cardProxyEvictCtx    context.Context
	cardProxyEvictCancel context.CancelFunc
)

func init() {
	cardProxyEvictCtx, cardProxyEvictCancel = context.WithCancel(context.Background())
}

func newCardProxyRateLimiter() *cardProxyRateLimiter {
	return &cardProxyRateLimiter{buckets: make(map[string]*rateBucket)}
}

// allow returns true if the user has remaining quota in the current window.
func (l *cardProxyRateLimiter) allow(userID string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	// Lazy-start the evictor on first allow() call
	if !l.evictStarted {
		l.evictStarted = true
		safego.GoWith("card-proxy/limiter-evictor", func() { startCardProxyLimiterEvictor(l, cardProxyEvictCtx) })
	}

	// Cap the map to prevent unbounded growth
	if len(l.buckets) >= cardProxyMaxBuckets {
		slog.Warn("[CardProxy] rate limiter map at capacity", "size", len(l.buckets))
		return false
	}

	now := time.Now()
	b, ok := l.buckets[userID]
	if !ok || now.Sub(b.window) > cardProxyRateWindow {
		l.buckets[userID] = &rateBucket{count: 1, window: now, lastUsed: now}
		return true
	}
	if b.count >= cardProxyRateMax {
		return false
	}
	b.count++
	b.lastUsed = now
	return true
}

// NewCardProxyHandler creates a new card proxy handler.
func NewCardProxyHandler(s store.Store) *CardProxyHandler {
	return &CardProxyHandler{store: s, limiter: newCardProxyRateLimiter()}
}

// Proxy handles GET /api/card-proxy?url=<encoded-url>.
func (h *CardProxyHandler) Proxy(c *fiber.Ctx) error {
	// Require at least editor role — viewers and anonymous users must not be
	// able to trigger outbound requests through the proxy (#12436).
	if err := RequireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	// #16515: Per-user rate limiting to prevent SSRF abuse through rapid requests.
	uid := middleware.GetUserID(c)
	rateLimitKey := uid.String()
	if rateLimitKey == "00000000-0000-0000-0000-000000000000" {
		rateLimitKey = c.IP()
	}
	if !h.limiter.allow(rateLimitKey) {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error": "Card proxy rate limit exceeded. Try again in a minute.",
		})
	}

	rawURL := c.Query("url")
	if rawURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing 'url' query parameter",
		})
	}

	host, err := h.validateProxyTarget(rawURL)
	if err != nil {
		return err
	}

	req, err := h.buildProxyRequest(c.Context(), rawURL, host)
	if err != nil {
		return err
	}

	resp, err := cardProxyClient.Do(req)
	if err != nil {
		slog.Error("[CardProxy] request failed", "host", host, "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "External request failed",
		})
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		location := resp.Header.Get("Location")
		slog.Info("[CardProxy] redirect detected", "host", host, "status", resp.StatusCode, "location", location)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": fmt.Sprintf("External API returned a redirect (%d). Update the URL to the final destination.", resp.StatusCode),
		})
	}

	limitedReader := io.LimitReader(resp.Body, cardProxyMaxResponseBytes+1)
	body, err := io.ReadAll(limitedReader)
	if err != nil {
		slog.Error("[CardProxy] failed to read response body", "host", host, "error", err)
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Failed to read external response",
		})
	}
	if len(body) > cardProxyMaxResponseBytes {
		slog.Info("[CardProxy] response too large", "host", host, "bytes", len(body))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Response too large (max 5 MB)",
		})
	}

	slog.Info("[CardProxy] proxied request", "clientIP", c.IP(), "host", host, "status", resp.StatusCode, "bytes", len(body))

	h.sanitizeResponse(c, resp)

	return c.Status(resp.StatusCode).Send(body)
}

// validateProxyTarget validates the target URL for SSRF protection.
func (h *CardProxyHandler) validateProxyTarget(rawURL string) (string, error) {
	if len(rawURL) > cardProxyMaxURLLen {
		return "", fiber.NewError(fiber.StatusBadRequest, "URL too long")
	}

	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", fiber.NewError(fiber.StatusBadRequest, "Invalid URL")
	}

	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", fiber.NewError(fiber.StatusBadRequest, "Only http and https URLs are allowed")
	}

	host := parsed.Hostname()
	if host == "" {
		return "", fiber.NewError(fiber.StatusBadRequest, "Invalid URL: missing host")
	}

	lowerHost := strings.ToLower(host)
	if lowerHost == "localhost" || lowerHost == "0.0.0.0" || lowerHost == "[::1]" {
		return "", fiber.NewError(fiber.StatusForbidden, "Requests to localhost are not allowed")
	}

	return host, nil
}

// startCardProxyLimiterEvictor periodically removes idle rate limiters
// (no requests for >10 minutes) to prevent unbounded map growth.
// Exits when ctx is cancelled.
//
//nolint:nilaway // ctx is always non-nil (created by context.WithCancel)
func startCardProxyLimiterEvictor(limiter *cardProxyRateLimiter, ctx context.Context) {
	if ctx == nil || limiter == nil {
		return
	}
	ticker := time.NewTicker(cardProxyEvictionInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now()
			// Collect stale keys under lock, then delete — avoids
			// holding the lock for the entire iteration when map is large.
			limiter.mu.Lock()
			stale := make([]string, 0)
			for userID, entry := range limiter.buckets {
				if now.Sub(entry.lastUsed) > cardProxyLimiterIdleTTL {
					stale = append(stale, userID)
				}
			}
			for _, id := range stale {
				delete(limiter.buckets, id)
			}
			limiter.mu.Unlock()
		}
	}
}

// StopCardProxyLimiterEvictor signals the background evictor goroutine to exit.
// Safe to call multiple times. Intended for server shutdown and tests.
func StopCardProxyLimiterEvictor() {
	cardProxyEvictCancel()
}

// buildProxyRequest constructs the HTTP request for the proxy target.
func (h *CardProxyHandler) buildProxyRequest(ctx context.Context, rawURL, host string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		slog.Error("[CardProxy] failed to build request", "host", host, "error", err)
		return nil, fiber.NewError(fiber.StatusBadGateway, "Failed to create proxy request")
	}
	req.Header.Set("User-Agent", "KubeStellar-Console-CardProxy/1.0")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	return req, nil
}

// sanitizeResponse cleans response headers to prevent XSS and forwards safe headers.
func (h *CardProxyHandler) sanitizeResponse(c *fiber.Ctx, resp *http.Response) {
	ct := resp.Header.Get("Content-Type")
	if ct != "" {
		ctLower := strings.ToLower(ct)
		if strings.Contains(ctLower, "html") || strings.Contains(ctLower, "xml") || strings.Contains(ctLower, "svg") || strings.Contains(ctLower, "javascript") {
			c.Set("Content-Type", "application/octet-stream")
		} else {
			c.Set("Content-Type", ct)
		}
	}
	c.Set("X-Content-Type-Options", "nosniff")

	for _, header := range []string{
		"X-Total-Count",
		"X-Request-Id",
		"ETag",
		"Last-Modified",
	} {
		if v := resp.Header.Get(header); v != "" {
			c.Set(header, v)
		}
	}
}
