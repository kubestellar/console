package handlers

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

var ga4Client = &http.Client{Timeout: 10 * time.Second}

// allowedOrigins lists hostnames that may send analytics through the proxy.
var allowedOrigins = map[string]bool{
	"localhost":               true,
	"127.0.0.1":              true,
	"console.kubestellar.io": true,
}

// GA4ScriptProxy proxies the gtag.js script through the console's own domain
// so that ad blockers do not block it.
func GA4ScriptProxy(c *fiber.Ctx) error {
	target := "https://www.googletagmanager.com/gtag/js?" + string(c.Context().QueryArgs().QueryString())
	resp, err := ga4Client.Get(target)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	defer resp.Body.Close()
	c.Set("Content-Type", resp.Header.Get("Content-Type"))
	c.Set("Cache-Control", "public, max-age=3600")
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	return c.Status(resp.StatusCode).Send(body)
}

// GA4CollectProxy proxies GA4 event collection requests through the console's
// own domain. It performs two critical functions:
//  1. Rewrites the `tid` (tracking ID) from the decoy Measurement ID to the
//     real one (set via GA4_REAL_MEASUREMENT_ID env var)
//  2. Validates the Origin/Referer header to reject requests from unknown hosts
func GA4CollectProxy(c *fiber.Ctx) error {
	if !isAllowedOrigin(c) {
		return c.SendStatus(fiber.StatusForbidden)
	}

	// GA4 Measurement ID — env var overrides the built-in default.
	// This is a public tracking identifier (not a secret), same as any website's GA ID.
	realMeasurementID := os.Getenv("GA4_REAL_MEASUREMENT_ID")
	if realMeasurementID == "" {
		realMeasurementID = "G-QPGNKGNNY2"
	}

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
		if clientIP != "" {
			params.Set("_uip", clientIP)
		}
		qs = params.Encode()
	}

	target := "https://www.google-analytics.com/g/collect?" + qs
	req, err := http.NewRequest(c.Method(), target, bytes.NewReader(c.Body()))
	if err != nil {
		return c.SendStatus(fiber.StatusBadGateway)
	}
	req.Header.Set("Content-Type", c.Get("Content-Type", "text/plain"))
	req.Header.Set("User-Agent", c.Get("User-Agent"))
	if clientIP != "" {
		req.Header.Set("X-Forwarded-For", clientIP)
	}

	resp, err := ga4Client.Do(req)
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

// isAllowedOrigin checks if the request comes from an allowed hostname.
func isAllowedOrigin(c *fiber.Ctx) bool {
	origin := c.Get("Origin")
	if origin != "" {
		if u, err := url.Parse(origin); err == nil {
			host := stripPort(u.Hostname())
			if allowedOrigins[host] || strings.HasSuffix(host, ".netlify.app") {
				return true
			}
		}
	}

	referer := c.Get("Referer")
	if referer != "" {
		if u, err := url.Parse(referer); err == nil {
			host := stripPort(u.Hostname())
			if allowedOrigins[host] || strings.HasSuffix(host, ".netlify.app") {
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
