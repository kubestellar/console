package handlers

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
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
			for _, ip := range ips {
				if isBlockedIP(ip.IP) {
					return nil, fmt.Errorf("blocked: private IP %s for host %s", ip.IP, host)
				}
			}
			// Connect to the first validated IP directly — no second DNS lookup
			dialer := &net.Dialer{Timeout: cardProxyTimeout}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	},
}

// blockedCIDRs contains CIDR ranges that must never be proxied.
// This prevents SSRF attacks against internal infrastructure.
var blockedCIDRs = func() []*net.IPNet {
	cidrs := []string{
		"127.0.0.0/8",    // loopback
		"10.0.0.0/8",     // RFC 1918 private
		"172.16.0.0/12",  // RFC 1918 private
		"192.168.0.0/16", // RFC 1918 private
		"169.254.0.0/16", // link-local
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 unique local
		"fe80::/10",      // IPv6 link-local
	}
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		_, ipnet, err := net.ParseCIDR(cidr)
		if err != nil {
			// Hardcoded CIDRs must always parse — a failure here is a programming error.
			slog.Error(fmt.Sprintf("[CardProxy] FATAL: failed to parse blocked CIDR %q: %v", cidr, err))
			os.Exit(1)
		}
		nets = append(nets, ipnet)
	}
	return nets
}()

// isBlockedIP returns true if the IP is in a private/reserved range.
func isBlockedIP(ip net.IP) bool {
	for _, cidr := range blockedCIDRs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

// CardProxyHandler proxies external HTTP GET requests for custom card code.
// Cards call useCardFetch(url) in the sandbox, which routes through this
// endpoint: GET /api/card-proxy?url=<encoded-url>
type CardProxyHandler struct{}

// NewCardProxyHandler creates a new card proxy handler.
func NewCardProxyHandler() *CardProxyHandler {
	return &CardProxyHandler{}
}

// Proxy handles GET /api/card-proxy?url=<encoded-url>.
func (h *CardProxyHandler) Proxy(c *fiber.Ctx) error {
	rawURL := c.Query("url")
	if rawURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing 'url' query parameter",
		})
	}

	// Validate URL length
	if len(rawURL) > cardProxyMaxURLLen {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "URL too long",
		})
	}

	// Parse and validate URL
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid URL",
		})
	}

	// Only allow http and https schemes
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Only http and https URLs are allowed",
		})
	}

	// Block empty host
	host := parsed.Hostname()
	if host == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid URL: missing host",
		})
	}

	// Block localhost synonyms
	lowerHost := strings.ToLower(host)
	if lowerHost == "localhost" || lowerHost == "0.0.0.0" || lowerHost == "[::1]" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"error": "Requests to localhost are not allowed",
		})
	}

	// SSRF protection: private/internal IP blocking is enforced in the custom
	// DialContext of cardProxyClient — checked at connection time, preventing
	// DNS rebinding attacks.

	// Build proxied request — GET only, tied to the client's request context
	// so the proxy request is cancelled if the client disconnects.
	req, err := http.NewRequestWithContext(c.Context(), http.MethodGet, rawURL, nil)
	if err != nil {
		slog.Error(fmt.Sprintf("[CardProxy] Failed to build request for %s: %v", host, err))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Failed to create proxy request",
		})
	}
	req.Header.Set("User-Agent", "KubeStellar-Console-CardProxy/1.0")
	req.Header.Set("Accept", "application/json, text/plain, */*")

	// Execute request
	resp, err := cardProxyClient.Do(req)
	if err != nil {
		slog.Error(fmt.Sprintf("[CardProxy] Request failed for %s: %v", host, err))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "External request failed",
		})
	}
	defer resp.Body.Close()

	// Detect redirects and return a helpful error instead of an opaque 3xx
	if resp.StatusCode >= 300 && resp.StatusCode < 400 {
		location := resp.Header.Get("Location")
		slog.Info(fmt.Sprintf("[CardProxy] Redirect from %s (status %d, location=%s)", host, resp.StatusCode, location))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": fmt.Sprintf("External API returned a redirect (%d). Update the URL to the final destination.", resp.StatusCode),
		})
	}

	// Read response with size limit
	limitedReader := io.LimitReader(resp.Body, cardProxyMaxResponseBytes+1)
	body, err := io.ReadAll(limitedReader)
	if err != nil {
		slog.Error(fmt.Sprintf("[CardProxy] Failed to read response body from %s: %v", host, err))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Failed to read external response",
		})
	}
	if len(body) > cardProxyMaxResponseBytes {
		slog.Info(fmt.Sprintf("[CardProxy] Response too large from %s: %d bytes", host, len(body)))
		return c.Status(fiber.StatusBadGateway).JSON(fiber.Map{
			"error": "Response too large (max 5 MB)",
		})
	}

	// Log successful proxy requests for audit trail
	slog.Info(fmt.Sprintf("[CardProxy] %s -> %s (status=%d, size=%d bytes)", c.IP(), host, resp.StatusCode, len(body)))

	// Forward Content-Type
	if ct := resp.Header.Get("Content-Type"); ct != "" {
		c.Set("Content-Type", ct)
	}

	// Forward CORS-safe headers that cards might need
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

	return c.Status(resp.StatusCode).Send(body)
}
