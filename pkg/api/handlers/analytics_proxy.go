package handlers

import (
	"bytes"
	"encoding/base64"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
)

var analyticsClient = &http.Client{Timeout: 10 * time.Second}

// allowedOrigins lists hostnames that may send analytics through the proxy.
var allowedOrigins = map[string]bool{
	"localhost":               true,
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

// GA4ScriptProxy proxies the gtag.js script through the console's own domain
// so that ad blockers do not block it. The response is cached server-side
// to prevent memory pressure from repeated fetches of the ~376KB script.
func GA4ScriptProxy(c *fiber.Ctx) error {
	qs := string(c.Context().QueryArgs().QueryString())

	// Check cache
	gtagCache.RLock()
	if gtagCache.body != nil && gtagCache.queryString == qs && time.Since(gtagCache.fetchedAt) < gtagCacheTTL {
		body := gtagCache.body
		ct := gtagCache.contentType
		gtagCache.RUnlock()
		c.Set("Content-Type", ct)
		c.Set("Cache-Control", "public, max-age=3600")
		return c.Send(body)
	}
	gtagCache.RUnlock()

	// Cache miss — fetch from Google
	target := "https://www.googletagmanager.com/gtag/js?" + qs
	resp, err := analyticsClient.Get(target)
	if err != nil {
		log.Printf("[GA4] Failed to fetch gtag.js: %v", err)
		return c.SendStatus(fiber.StatusBadGateway)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}

	ct := resp.Header.Get("Content-Type")

	// Update cache
	if resp.StatusCode == http.StatusOK {
		gtagCache.Lock()
		gtagCache.body = body
		gtagCache.contentType = ct
		gtagCache.fetchedAt = time.Now()
		gtagCache.queryString = qs
		gtagCache.Unlock()
	}

	c.Set("Content-Type", ct)
	c.Set("Cache-Control", "public, max-age=3600")
	return c.Status(resp.StatusCode).Send(body)
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
	req, err := http.NewRequest(http.MethodPost, target, bytes.NewReader([]byte(qs)))
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
	body, err := io.ReadAll(resp.Body)
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

// isAllowedOrigin checks if the request comes from an allowed hostname.
// In addition to the explicit allowlist, same-origin requests are always
// permitted — this ensures OpenShift and other dynamic deployments work
// without maintaining an exhaustive hostname list.
func isAllowedOrigin(c *fiber.Ctx) bool {
	requestHost := stripPort(c.Hostname())

	origin := c.Get("Origin")
	if origin != "" {
		if u, err := url.Parse(origin); err == nil {
			host := stripPort(u.Hostname())
			if allowedOrigins[host] || strings.HasSuffix(host, ".netlify.app") || host == requestHost {
				return true
			}
		}
	}

	referer := c.Get("Referer")
	if referer != "" {
		if u, err := url.Parse(referer); err == nil {
			host := stripPort(u.Hostname())
			if allowedOrigins[host] || strings.HasSuffix(host, ".netlify.app") || host == requestHost {
				return true
			}
		}
	}

	// Browsers always send Origin or Referer for XHR/fetch requests.
	// Allow requests with neither header (e.g., server-to-server, curl).
	return origin == "" && referer == ""
}

// stripPort removes the port from a hostname (e.g., "localhost:5174" → "localhost").
func stripPort(host string) string {
	if i := strings.LastIndex(host, ":"); i != -1 {
		return host[:i]
	}
	return host
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
	// Check cache
	umamiScriptCache.RLock()
	if umamiScriptCache.body != nil && time.Since(umamiScriptCache.fetchedAt) < umamiScriptCacheTTL {
		body := umamiScriptCache.body
		ct := umamiScriptCache.contentType
		umamiScriptCache.RUnlock()
		c.Set("Content-Type", ct)
		c.Set("Cache-Control", "public, max-age=3600")
		return c.Send(body)
	}
	umamiScriptCache.RUnlock()

	// Cache miss — fetch from upstream Umami instance
	target := umamiUpstreamBase + "/ksc"
	resp, err := analyticsClient.Get(target)
	if err != nil {
		log.Printf("[Umami] Failed to fetch tracking script: %v", err)
		return c.SendStatus(fiber.StatusBadGateway)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
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

	c.Set("Content-Type", ct)
	c.Set("Cache-Control", "public, max-age=3600")
	return c.Status(resp.StatusCode).Send(body)
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
	req, err := http.NewRequest(http.MethodPost, target, bytes.NewReader(c.Body()))
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
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	return c.Status(resp.StatusCode).Send(body)
}
