package handlers

import (
	"bytes"
	"encoding/base64"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/sync/singleflight"
)

// analyticsUpstreamTimeout is the maximum time the proxy waits for a response
// from the upstream analytics service (Google Analytics, Umami).
const analyticsUpstreamTimeout = 10 * time.Second

var analyticsClient = &http.Client{Timeout: analyticsUpstreamTimeout}

// allowedOrigins lists hostnames that may send analytics through the proxy.
var allowedOrigins = map[string]bool{
	"localhost":              true,
	"127.0.0.1":              true,
	"console.kubestellar.io": true,
}

const (
	// gtagCacheTTL is how long the gtag.js script is cached server-side.
	// The script is ~376KB — without caching, each browser request allocates
	// a fresh 376KB buffer, which under rapid polling (e.g. login redirect loop)
	// causes memory to grow faster than GC can reclaim.
	gtagCacheTTL = 1 * time.Hour

	// umamiScriptCacheTTL is how long the Umami tracking script is cached.
	umamiScriptCacheTTL = 1 * time.Hour

	// umamiUpstreamBase is the external Umami instance that the proxy relays to.
	umamiUpstreamBase = "https://analytics.kubestellar.io"

	// maxProxyResponseBytes is the maximum upstream response body size the proxy
	// will buffer. Prevents multi-GB memory exhaustion from malicious or
	// misconfigured upstreams (#7022).
	maxProxyResponseBytes = 10 * 1024 * 1024 // 10 MB
)

// gtagCache holds a server-side cache of the gtag.js script to avoid
// re-fetching 376KB from Google on every request.
var gtagCache struct {
	sync.RWMutex
	body        []byte
	contentType string
	fetchedAt   time.Time
	queryString string // cache key — different measurement IDs get different scripts
}

// scriptFetchGroup coalesces concurrent cold-cache fetches into a single
// upstream request, preventing cache stampede on the CDN (#7021).
var scriptFetchGroup singleflight.Group

// GA4ScriptProxy proxies the gtag.js script through the console's own domain
// so that ad blockers do not block it. The response is cached server-side
// to prevent memory pressure from repeated fetches of the ~376KB script.
func GA4ScriptProxy(c *fiber.Ctx) error {
	qs := string(c.Context().QueryArgs().QueryString())

	// Check cache — copy the body slice under lock to prevent TOCTOU races
	gtagCache.RLock()
	if gtagCache.body != nil && gtagCache.queryString == qs && time.Since(gtagCache.fetchedAt) < gtagCacheTTL {
		bodyCopy := make([]byte, len(gtagCache.body))
		copy(bodyCopy, gtagCache.body)
		ct := gtagCache.contentType
		gtagCache.RUnlock()
		c.Set("Content-Type", ct)
		c.Set("Cache-Control", "public, max-age=3600")
		return c.Send(bodyCopy)
	}
	gtagCache.RUnlock()

	// Cache miss — use singleflight to coalesce concurrent fetches (#7021)
	type gtagResult struct {
		body        []byte
		contentType string
		statusCode  int
	}
	val, err, _ := scriptFetchGroup.Do("gtag:"+qs, func() (interface{}, error) {
		target := "https://www.googletagmanager.com/gtag/js?" + qs
		resp, fetchErr := analyticsClient.Get(target)
		if fetchErr != nil {
			slog.Error("[GA4] failed to fetch gtag.js", "error", fetchErr)
			return nil, fetchErr
		}
		defer resp.Body.Close()

		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxProxyResponseBytes))
		if readErr != nil {
			return nil, readErr
		}

		ct := resp.Header.Get("Content-Type")

		// Update cache on success
		if resp.StatusCode == http.StatusOK {
			gtagCache.Lock()
			gtagCache.body = body
			gtagCache.contentType = ct
			gtagCache.fetchedAt = time.Now()
			gtagCache.queryString = qs
			gtagCache.Unlock()
		}

		return &gtagResult{body: body, contentType: ct, statusCode: resp.StatusCode}, nil
	})
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}

	result := val.(*gtagResult)
	c.Set("Content-Type", result.contentType)
	c.Set("Cache-Control", "public, max-age=3600")
	return c.Status(result.statusCode).Send(result.body)
}

// GA4CollectProxy proxies GA4 event collection requests through the console's
// own domain. It performs two critical functions:
//  1. Rewrites the `tid` (measurement ID) from the decoy to the
//     real one (set via GA4_REAL_MEASUREMENT_ID env var)
//  2. Validates the Origin/Referer header to reject requests from unknown hosts
func GA4CollectProxy(c *fiber.Ctx) error {
	if !isAllowedOrigin(c) {
		return c.SendStatus(fiber.StatusForbidden)
	}

	realMeasurementID := ga4RealMeasurementID()

	// Decode base64-encoded payload from `d` parameter.
	// Browser sends: /api/m?d=<base64(v=2&tid=G-0000000000&cid=...)>
	var qs string
	if d := c.Query("d"); d != "" {
		decoded, err := base64.StdEncoding.DecodeString(d)
		if err != nil {
			return c.SendStatus(fiber.StatusBadRequest)
		}
		qs = string(decoded)
	} else {
		// Fallback: plain query params (backwards compat)
		qs = string(c.Context().QueryArgs().QueryString())
	}

	// Forward user's real IP so GA4 geolocates correctly
	clientIP := c.Get("X-Forwarded-For")
	if clientIP != "" {
		if i := strings.Index(clientIP, ","); i != -1 {
			clientIP = strings.TrimSpace(clientIP[:i])
		}
	}
	if clientIP == "" {
		clientIP = c.Get("X-Real-Ip")
	}
	if clientIP == "" {
		clientIP = c.IP()
	}

	params, err := url.ParseQuery(qs)
	if err == nil {
		if realMeasurementID != "" && params.Get("tid") != "" {
			params.Set("tid", realMeasurementID)
		}
		// Only set _uip when we have a routable (public) IP.
		// For localhost deployments the proxy's outbound IP IS the
		// user's real public IP, so omitting _uip lets GA4 geolocate
		// from the connection source — which is correct.
		if clientIP != "" && !isPrivateIP(clientIP) {
			params.Set("_uip", clientIP)
		}
		qs = params.Encode()
	}

	// Send params as POST body (not URL query string) so GA4 respects _uip
	// for geolocation. The /g/collect endpoint ignores _uip in query params
	// when the request comes from a server IP.
	target := "https://www.google-analytics.com/g/collect"
	req, err := http.NewRequestWithContext(c.UserContext(), http.MethodPost, target, bytes.NewReader([]byte(qs)))
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("User-Agent", c.Get("User-Agent"))
	if clientIP != "" && !isPrivateIP(clientIP) {
		req.Header.Set("X-Forwarded-For", clientIP)
	}

	resp, err := analyticsClient.Do(req)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxProxyResponseBytes))
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	return c.Status(resp.StatusCode).Send(body)
}

// ga4RealMeasurementID returns the real GA4 measurement ID from env or default.
func ga4RealMeasurementID() string {
	id := os.Getenv("GA4_REAL_MEASUREMENT_ID")
	if id == "" {
		id = "G-PXWNVQ8D1T"
	}
	return id
}

// isAllowedNetlifyHost returns true if host is a KubeStellar Netlify preview
// deployment. Only the project's own deploy-preview subdomains are accepted;
// the blanket *.netlify.app wildcard is intentionally NOT used because any
// attacker-controlled Netlify site would pass that check (#7032).
func isAllowedNetlifyHost(host string) bool {
	// Production: kubestellar-console.netlify.app
	if host == "kubestellar-console.netlify.app" {
		return true
	}
	// Deploy previews: deploy-preview-<N>--kubestellar-console.netlify.app
	if strings.HasSuffix(host, "--kubestellar-console.netlify.app") {
		return true
	}
	return false
}

// isAllowedOrigin checks if the request comes from an allowed hostname.
// In addition to the explicit allowlist, same-origin requests are always
// permitted — this ensures OpenShift and other dynamic deployments work
// without maintaining an exhaustive hostname list.
//
// Security: only the Origin header is checked — Referer is not used because
// it is trivially forgeable by non-browser HTTP clients (#7031).
func isAllowedOrigin(c *fiber.Ctx) bool {
	origin := c.Get("Origin")
	if origin == "" {
		// Allow requests without an Origin header. Non-browser clients (server-side
		// trackers, embedded integrations, curl) legitimately omit Origin. When
		// present, we validate it; when absent, we permit the request to avoid
		// breaking automated analytics submission (#12308).
		return true
	}

	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := stripPort(u.Hostname())

	// Explicit allowlist
	if allowedOrigins[host] {
		return true
	}

	// KubeStellar Netlify previews only (#7032)
	if isAllowedNetlifyHost(host) {
		return true
	}

	// Same-origin: the Origin host matches the request's Host header.
	// This ensures OpenShift and other dynamic deployments work without
	// maintaining an exhaustive hostname list.
	requestHost := stripPort(c.Hostname())
	return host == requestHost
}

// stripPort removes the port from a hostname (e.g., "localhost:5174" → "localhost").
// IPv6 addresses (e.g., "::1") are returned unchanged — the colon in an IPv6
// address is NOT a port separator. net.SplitHostPort is used when the value
// looks like it contains a port, which handles both IPv4 and IPv6 correctly.
func stripPort(host string) string {
	// If the host contains no colon, there is no port to strip.
	if !strings.Contains(host, ":") {
		return host
	}
	// net.SplitHostPort handles "[::1]:port", "host:port", etc.
	h, _, err := net.SplitHostPort(host)
	if err != nil {
		// Not in host:port form — return as-is (bare IPv6 like "::1").
		return host
	}
	return h
}

// isPrivateIP returns true for loopback, link-local, and RFC-1918 addresses.
// When the proxy runs on the user's own machine (localhost install), c.IP()
// returns 127.0.0.1 — sending that as _uip tells GA4 the user is at a
// non-routable address, killing geolocation.  By detecting private IPs we
// can skip the _uip override and let GA4 use the connection's source IP.
func isPrivateIP(ip string) bool {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	return parsed.IsLoopback() || parsed.IsPrivate() || parsed.IsLinkLocalUnicast()
}

// ── Umami First-Party Proxy ─────────────────────────────────────────
// Mirrors the GA4 first-party proxy pattern: serve the tracking script
// and relay events through the console's own domain so that ad blockers
// and corporate firewalls don't block analytics.kubestellar.io.

// umamiScriptCache holds a server-side cache of the Umami tracking script.
var umamiScriptCache struct {
	sync.RWMutex
	body        []byte
	contentType string
	fetchedAt   time.Time
}

// UmamiScriptProxy serves the Umami tracking script (/api/ksc) from the
// console's own domain. The script is cached server-side to avoid
// re-fetching on every page load.
func UmamiScriptProxy(c *fiber.Ctx) error {
	// Check cache — copy the body slice under lock to prevent TOCTOU races
	umamiScriptCache.RLock()
	if umamiScriptCache.body != nil && time.Since(umamiScriptCache.fetchedAt) < umamiScriptCacheTTL {
		bodyCopy := make([]byte, len(umamiScriptCache.body))
		copy(bodyCopy, umamiScriptCache.body)
		ct := umamiScriptCache.contentType
		umamiScriptCache.RUnlock()
		c.Set("Content-Type", ct)
		c.Set("Cache-Control", "public, max-age=3600")
		return c.Send(bodyCopy)
	}
	umamiScriptCache.RUnlock()

	// Cache miss — use singleflight to coalesce concurrent fetches (#7021)
	type umamiResult struct {
		body        []byte
		contentType string
		statusCode  int
	}
	val, err, _ := scriptFetchGroup.Do("umami", func() (interface{}, error) {
		target := umamiUpstreamBase + "/ksc"
		resp, fetchErr := analyticsClient.Get(target)
		if fetchErr != nil {
			slog.Error("[Umami] failed to fetch tracking script", "error", fetchErr)
			return nil, fetchErr
		}
		defer resp.Body.Close()

		body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxProxyResponseBytes))
		if readErr != nil {
			return nil, readErr
		}

		ct := resp.Header.Get("Content-Type")

		// Update cache on success
		if resp.StatusCode == http.StatusOK {
			umamiScriptCache.Lock()
			umamiScriptCache.body = body
			umamiScriptCache.contentType = ct
			umamiScriptCache.fetchedAt = time.Now()
			umamiScriptCache.Unlock()
		}

		return &umamiResult{body: body, contentType: ct, statusCode: resp.StatusCode}, nil
	})
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}

	result := val.(*umamiResult)
	c.Set("Content-Type", result.contentType)
	c.Set("Cache-Control", "public, max-age=3600")
	return c.Status(result.statusCode).Send(result.body)
}

// UmamiCollectProxy relays Umami event payloads to the upstream instance.
// The browser POSTs JSON to /api/send; this handler forwards it to
// analytics.kubestellar.io/api/send with the client's real IP so
// geolocation works correctly.
func UmamiCollectProxy(c *fiber.Ctx) error {
	if !isAllowedOrigin(c) {
		return c.SendStatus(fiber.StatusForbidden)
	}

	// Extract client IP for geolocation (same logic as GA4 proxy)
	clientIP := c.Get("X-Forwarded-For")
	if clientIP != "" {
		if i := strings.Index(clientIP, ","); i != -1 {
			clientIP = strings.TrimSpace(clientIP[:i])
		}
	}
	if clientIP == "" {
		clientIP = c.Get("X-Real-Ip")
	}
	if clientIP == "" {
		clientIP = c.IP()
	}

	target := umamiUpstreamBase + "/api/send"
	req, err := http.NewRequestWithContext(c.UserContext(), http.MethodPost, target, bytes.NewReader(c.Body()))
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", c.Get("User-Agent"))
	if clientIP != "" && !isPrivateIP(clientIP) {
		req.Header.Set("X-Forwarded-For", clientIP)
	}

	resp, err := analyticsClient.Do(req)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxProxyResponseBytes))
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	return c.Status(resp.StatusCode).Send(body)
}
