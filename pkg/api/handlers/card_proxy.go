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
	"time"

	"github.com/gofiber/fiber/v2"

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

// isBlockedIP returns true if the IP is in a non-public range.
func isBlockedIP(ip net.IP) bool {
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified()
}

// CardProxyHandler proxies external HTTP GET requests for custom card code.
// Cards call useCardFetch(url) in the sandbox, which routes through this
// endpoint: GET /api/card-proxy?url=<encoded-url>
type CardProxyHandler struct {
	store store.Store
}

// NewCardProxyHandler creates a new card proxy handler.
func NewCardProxyHandler(s store.Store) *CardProxyHandler {
	return &CardProxyHandler{store: s}
}

// Proxy handles GET /api/card-proxy?url=<encoded-url>.
func (h *CardProxyHandler) Proxy(c *fiber.Ctx) error {
	// Require at least editor role — viewers and anonymous users must not be
	// able to trigger outbound requests through the proxy (#12436).
	if err := requireEditorOrAdmin(c, h.store); err != nil {
		return err
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
