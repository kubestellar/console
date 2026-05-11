package handlers

import (
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
)

const (
	quantumProxyTimeout = 30 * time.Second
)

// quantumClient uses a shared HTTP client with timeout to prevent hanging requests
var quantumClient = &http.Client{
	Timeout: quantumProxyTimeout,
}

// Safe headers to forward from the client to the quantum service
// (excludes sensitive headers like Cookie, Authorization, etc.)
var safeHeadersToForward = map[string]bool{
	"Accept":           true,
	"Accept-Encoding":  true,
	"Accept-Language":  true,
	"User-Agent":       true,
	"Content-Type":     true,
	"X-Requested-With": true,
}

type QuantumProxyHandler struct {
	quantumServiceURL string
}

func NewQuantumProxyHandler() *QuantumProxyHandler {
	// Get service URL from env, default to localhost port-forward
	// The port-forward bridges kubectl to localhost:5000 in dev environments
	url := os.Getenv("QUANTUM_SERVICE_URL")
	if url == "" {
		url = "http://localhost:5000"
	}
	return &QuantumProxyHandler{
		quantumServiceURL: url,
	}
}

// ProxyRequest handles GET requests to quantum endpoints
func (h *QuantumProxyHandler) ProxyRequest(c *fiber.Ctx) error {
	endpoint := c.Params("*")
	// Prepend /api/ to the endpoint path to match quantum backend API structure
	targetURL := h.quantumServiceURL + "/api/" + endpoint

	// Forward query parameters
	if queryStr := c.Request().URI().QueryArgs().String(); queryStr != "" {
		targetURL += "?" + queryStr
	}

	slog.Debug("[QuantumProxy] Forwarding request", "from", c.Path(), "to", targetURL)

	// Create HTTP client request
	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		slog.Error("[QuantumProxy] Failed to create request", "target", targetURL, "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create request")
	}

	// Forward only safe headers (exclude sensitive headers like Cookie, Authorization)
	c.Request().Header.VisitAll(func(key, value []byte) {
		keyStr := string(key)
		if safeHeadersToForward[keyStr] {
			req.Header.Add(keyStr, string(value))
		}
	})

	// Execute request with shared client (has timeout)
	resp, err := quantumClient.Do(req)
	if err != nil {
		slog.Error("[QuantumProxy] Quantum service unavailable", "target", targetURL, "error", err)
		return fiber.NewError(fiber.StatusServiceUnavailable, "Quantum service unavailable")
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to read response")
	}

	slog.Debug("[QuantumProxy] Response received", "status", resp.StatusCode, "content_type", resp.Header.Get("Content-Type"), "body_size", len(body))

	// Set response headers and status
	c.Status(resp.StatusCode)
	c.Set("Content-Type", resp.Header.Get("Content-Type"))

	return c.Send(body)
}

// ProxyResultHistogram handles GET requests to /api/result/histogram
func (h *QuantumProxyHandler) ProxyResultHistogram(c *fiber.Ctx) error {
	sort := c.Query("sort", "count")
	targetURL := h.quantumServiceURL + "/api/result/histogram?sort=" + sort

	slog.Debug("[QuantumProxy] Forwarding histogram request", "from", c.Path(), "to", targetURL)

	req, err := http.NewRequest(http.MethodGet, targetURL, nil)
	if err != nil {
		slog.Error("[QuantumProxy] Failed to create request", "target", targetURL, "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create request")
	}

	// Forward only safe headers (exclude sensitive headers like Cookie, Authorization)
	c.Request().Header.VisitAll(func(key, value []byte) {
		keyStr := string(key)
		if safeHeadersToForward[keyStr] {
			req.Header.Add(keyStr, string(value))
		}
	})

	// Execute request with shared client (has timeout)
	resp, err := quantumClient.Do(req)
	if err != nil {
		slog.Error("[QuantumProxy] Quantum service unavailable", "target", targetURL, "error", err)
		return fiber.NewError(fiber.StatusServiceUnavailable, "Quantum service unavailable")
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to read response")
	}

	slog.Debug("[QuantumProxy] Histogram response received", "status", resp.StatusCode, "content_type", resp.Header.Get("Content-Type"), "body_size", len(body))

	c.Status(resp.StatusCode)
	c.Set("Content-Type", resp.Header.Get("Content-Type"))

	return c.Send(body)
}

// ProxyPostRequest handles POST requests to quantum endpoints
func (h *QuantumProxyHandler) ProxyPostRequest(c *fiber.Ctx) error {
	endpoint := c.Params("*")
	// Prepend /api/ to the endpoint path to match quantum backend API structure
	targetURL := h.quantumServiceURL + "/api/" + endpoint

	// Forward query parameters
	if queryStr := c.Request().URI().QueryArgs().String(); queryStr != "" {
		targetURL += "?" + queryStr
	}

	slog.Debug("[QuantumProxy] Forwarding POST request", "from", c.Path(), "to", targetURL)

	// Create HTTP client request
	req, err := http.NewRequest(http.MethodPost, targetURL, strings.NewReader(string(c.Body())))
	if err != nil {
		slog.Error("[QuantumProxy] Failed to create request", "target", targetURL, "error", err)
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to create request")
	}

	// Forward only safe headers (exclude sensitive headers like Cookie, Authorization)
	c.Request().Header.VisitAll(func(key, value []byte) {
		keyStr := string(key)
		if safeHeadersToForward[keyStr] {
			req.Header.Add(keyStr, string(value))
		}
	})

	// Execute request with shared client (has timeout)
	resp, err := quantumClient.Do(req)
	if err != nil {
		slog.Error("[QuantumProxy] Quantum service unavailable", "target", targetURL, "error", err)
		return fiber.NewError(fiber.StatusServiceUnavailable, "Quantum service unavailable")
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fiber.NewError(fiber.StatusInternalServerError, "Failed to read response")
	}

	slog.Debug("[QuantumProxy] Response received", "status", resp.StatusCode, "content_type", resp.Header.Get("Content-Type"), "body_size", len(body))

	// Set response headers and status
	c.Status(resp.StatusCode)
	c.Set("Content-Type", resp.Header.Get("Content-Type"))

	return c.Send(body)
}
