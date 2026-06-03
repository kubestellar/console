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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v2"
	"golang.org/x/time/rate"

	"github.com/kubestellar/console/pkg/api/middleware"
	"github.com/kubestellar/console/pkg/safego"
	"github.com/kubestellar/console/pkg/store"
)

const (
	cardProxyTimeout              = 15 * time.Second
	cardProxyMaxResponseBytes     = 5 * 1024 * 1024
	cardProxyMaxURLLen            = 2048
	cardProxyMaxRequestsPerMinute = 10
	cardProxyBurstSize            = cardProxyMaxRequestsPerMinute
	cardProxyRetryAfterSeconds    = 60
	cardProxyDefaultServiceCIDRs  = "10.96.0.0/12,10.43.0.0/16,172.20.0.0/16,172.30.0.0/16"
	cardProxyLimiterIdleTTL       = 10 * time.Minute
	cardProxyEvictionInterval     = 5 * time.Minute
)

var (
	_, cgnatNet, _        = net.ParseCIDR("100.64.0.0/10")
	_, cloudMetadataIP, _ = net.ParseCIDR("169.254.169.254/32")
	_, ietfProtocolNet, _ = net.ParseCIDR("192.0.0.0/24")
)

type cardProxyLimiterEntry struct {
	limiter  *rate.Limiter
	lastUsed time.Time
}

var cardProxyLimiters struct {
	sync.Mutex
	m            map[string]*cardProxyLimiterEntry
	evictStarted bool
}

var (
	cardProxyEvictCtx    context.Context
	cardProxyEvictCancel context.CancelFunc
)

func init() {
	cardProxyLimiters.m = make(map[string]*cardProxyLimiterEntry)
	cardProxyEvictCtx, cardProxyEvictCancel = context.WithCancel(context.Background())
}

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
			dialer := &net.Dialer{Timeout: cardProxyTimeout}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].IP.String(), port))
		},
	},
}

func isBlockedIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() ||
		cgnatNet.Contains(ip) || cloudMetadataIP.Contains(ip) || ietfProtocolNet.Contains(ip) {
		return true
	}

	for _, cidr := range getKubernetesServiceCIDRs() {
		if cidr.Contains(ip) {
			return true
		}
	}

	return false
}

type CardProxyHandler struct {
	store store.Store
}

func NewCardProxyHandler(s store.Store) *CardProxyHandler {
	return &CardProxyHandler{store: s}
}

func (h *CardProxyHandler) Proxy(c *fiber.Ctx) error {
	if err := requireEditorOrAdmin(c, h.store); err != nil {
		return err
	}

	rawURL := c.Query("url")
	if rawURL == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Missing 'url' query parameter",
		})
	}

	limiterKey := middleware.GetUserID(c).String()
	if limiterKey == "00000000-0000-0000-0000-000000000000" {
		limiterKey = c.IP()
	}
	if !getCardProxyLimiter(limiterKey).Allow() {
		slog.Warn("[CardProxy] rate limit exceeded", "user", limiterKey)
		c.Set("Retry-After", strconv.Itoa(cardProxyRetryAfterSeconds))
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"error": "Card proxy rate limit exceeded. Please wait a moment and retry.",
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

	normalizedHost := strings.TrimSuffix(strings.ToLower(host), ".")
	if normalizedHost == "localhost" || normalizedHost == "0.0.0.0" || normalizedHost == "::1" {
		return "", fiber.NewError(fiber.StatusForbidden, "Requests to localhost are not allowed")
	}

	if parsedIP := net.ParseIP(normalizedHost); parsedIP != nil && isBlockedIP(parsedIP) {
		return "", fiber.NewError(fiber.StatusForbidden, "Requests to private or reserved IPs are not allowed")
	}

	if !isAllowedCardProxyDomain(normalizedHost) {
		return "", fiber.NewError(fiber.StatusForbidden, "Target domain is not allowed by CARD_PROXY_DOMAIN_ALLOWLIST")
	}

	return host, nil
}

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

	for _, header := range []string{"X-Total-Count", "X-Request-Id", "ETag", "Last-Modified"} {
		if v := resp.Header.Get(header); v != "" {
			c.Set(header, v)
		}
	}
}

func getCardProxyLimiter(key string) *rate.Limiter {
	cardProxyLimiters.Lock()
	defer cardProxyLimiters.Unlock()

	if !cardProxyLimiters.evictStarted {
		cardProxyLimiters.evictStarted = true
		safego.GoWith("card-proxy/limiter-evictor", func() { startCardProxyLimiterEvictor(cardProxyEvictCtx) })
	}

	if entry, ok := cardProxyLimiters.m[key]; ok {
		entry.lastUsed = time.Now()
		return entry.limiter
	}

	limiter := rate.NewLimiter(rate.Every(time.Minute/cardProxyMaxRequestsPerMinute), cardProxyBurstSize)
	cardProxyLimiters.m[key] = &cardProxyLimiterEntry{limiter: limiter, lastUsed: time.Now()}
	return limiter
}

func startCardProxyLimiterEvictor(ctx context.Context) {
	ticker := time.NewTicker(cardProxyEvictionInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			now := time.Now()
			cardProxyLimiters.Lock()
			staleKeys := make([]string, 0)
			for key, entry := range cardProxyLimiters.m {
				if now.Sub(entry.lastUsed) > cardProxyLimiterIdleTTL {
					staleKeys = append(staleKeys, key)
				}
			}
			for _, key := range staleKeys {
				delete(cardProxyLimiters.m, key)
			}
			cardProxyLimiters.Unlock()
		}
	}
}

func getKubernetesServiceCIDRs() []*net.IPNet {
	raw := strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_CIDR"))
	if raw == "" {
		raw = cardProxyDefaultServiceCIDRs
	}
	return parseCardProxyCIDRs(raw)
}

func parseCardProxyCIDRs(raw string) []*net.IPNet {
	cidrs := make([]*net.IPNet, 0)
	for _, part := range strings.Split(raw, ",") {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		_, parsed, err := net.ParseCIDR(trimmed)
		if err != nil {
			slog.Warn("[CardProxy] ignoring invalid service CIDR", "cidr", trimmed, "error", err)
			continue
		}
		cidrs = append(cidrs, parsed)
	}
	return cidrs
}

func getCardProxyDomainAllowlist() []string {
	raw := strings.TrimSpace(os.Getenv("CARD_PROXY_DOMAIN_ALLOWLIST"))
	if raw == "" {
		return nil
	}

	allowlist := make([]string, 0)
	seen := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		domain := strings.TrimSpace(strings.ToLower(part))
		domain = strings.TrimPrefix(domain, ".")
		domain = strings.TrimSuffix(domain, ".")
		if domain == "" {
			continue
		}
		if _, ok := seen[domain]; ok {
			continue
		}
		seen[domain] = struct{}{}
		allowlist = append(allowlist, domain)
	}
	return allowlist
}

func isAllowedCardProxyDomain(host string) bool {
	allowlist := getCardProxyDomainAllowlist()
	if len(allowlist) == 0 {
		return true
	}

	normalizedHost := strings.TrimSuffix(strings.ToLower(host), ".")
	for _, allowedDomain := range allowlist {
		if normalizedHost == allowedDomain || strings.HasSuffix(normalizedHost, "."+allowedDomain) {
			return true
		}
	}
	return false
}
