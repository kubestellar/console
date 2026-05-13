package handlers

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

// pingClient is a shared HTTP client for ping requests.
// It follows redirects minimally and has a short timeout so that
// the measured latency reflects actual network RTT.
var pingClient = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12},
		DisableKeepAlives: true,
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
			// Connect to the first validated IP directly — no second DNS lookup.
			dialer := &net.Dialer{Timeout: 5 * time.Second}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	},
	// Do not follow redirects — we only care about reachability
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		return http.ErrUseLastResponse
	},
}

// PingHandler performs a server-side HTTP HEAD request to measure latency
// and reachability of a given URL. This avoids the browser's no-cors
// limitation where opaque responses prevent reading status codes.
//
// Query parameters:
//   - url: the target URL to ping (required)
//
// Returns JSON:
//
//	{
//	  "url":        "https://example.com",
//	  "status":     "success" | "timeout" | "error",
//	  "statusCode": 200,
//	  "latencyMs":  42,
//	  "error":      ""
//	}
func PingHandler(c *fiber.Ctx) error {
	rawURL := c.Query("url")
	if rawURL == "" {
		return c.Status(400).JSON(fiber.Map{"error": "url query parameter is required"})
	}

	// Ensure the URL has a scheme
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		rawURL = "https://" + rawURL
	}

	// Validate the URL to prevent SSRF and reject malformed input
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid url"})
	}

	// Reject URLs without a valid scheme
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid url: scheme must be http or https"})
	}

	host := parsed.Hostname()
	if host == "" {
		return c.Status(400).JSON(fiber.Map{"error": "invalid url: no host"})
	}

	// Reject URLs with userinfo (user:pass@host) — potential credential leak
	if parsed.User != nil {
		return c.Status(400).JSON(fiber.Map{"error": "invalid url: userinfo not allowed"})
	}

	// Reject hosts that are bare IPs with invalid formats
	if net.ParseIP(host) == nil && !strings.Contains(host, ".") && !strings.Contains(host, ":") {
		return c.Status(400).JSON(fiber.Map{"error": "invalid url: host must be a valid domain or IP"})
	}

	// Block requests to private/internal IPs to prevent SSRF
	if isPrivateHost(host) {
		return c.Status(403).JSON(fiber.Map{"error": "pinging private/internal addresses is not allowed"})
	}

	// Perform the HEAD request and measure latency
	start := time.Now()
	req, err := http.NewRequestWithContext(c.UserContext(), "HEAD", rawURL, nil)
	if err != nil {
		slog.Error("[PingHandler] invalid request", "url", rawURL, "error", err)
		return c.Status(400).JSON(fiber.Map{"error": "invalid request"})
	}
	req.Header.Set("User-Agent", "KubeStellar-Console-Ping/1.0")

	resp, err := pingClient.Do(req)
	latencyMs := time.Since(start).Milliseconds()

	if err != nil {
		// Distinguish timeout from other errors and return appropriate HTTP status.
		// Sanitize error messages to avoid exposing internal network details
		// (e.g. raw "dial tcp" errors with internal IPs).
		status := "error"
		sanitizedErr := "target unreachable"
		httpStatus := fiber.StatusBadGateway
		if isTimeoutError(err) {
			status = "timeout"
			sanitizedErr = "request timed out"
			httpStatus = fiber.StatusGatewayTimeout
		}
		return c.Status(httpStatus).JSON(fiber.Map{
			"url":       rawURL,
			"status":    status,
			"latencyMs": latencyMs,
			"error":     sanitizedErr,
		})
	}
	defer resp.Body.Close()

	// Any HTTP response means the host is reachable
	return c.JSON(fiber.Map{
		"url":        rawURL,
		"status":     "success",
		"statusCode": resp.StatusCode,
		"latencyMs":  latencyMs,
		"error":      "",
	})
}

// isPrivateHost checks whether a hostname resolves to a blocked IP.
func isPrivateHost(host string) bool {
	// Block well-known internal hostnames
	lower := strings.ToLower(host)
	if lower == "localhost" || lower == "metadata.google.internal" ||
		strings.HasSuffix(lower, ".internal") || strings.HasSuffix(lower, ".local") {
		return true
	}

	// Resolve and check IPs
	ips, err := net.LookupHost(host)
	if err != nil {
		return false // Let the actual request fail naturally
	}
	for _, ipStr := range ips {
		ip := net.ParseIP(ipStr)
		if ip == nil {
			continue
		}
		if isBlockedIP(ip) {
			return true
		}
	}
	return false
}

// isTimeoutError checks if an error is a timeout.
func isTimeoutError(err error) bool {
	if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
		return true
	}
	return strings.Contains(err.Error(), "timeout") || strings.Contains(err.Error(), "deadline exceeded")
}
