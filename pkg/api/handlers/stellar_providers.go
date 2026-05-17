package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"github.com/kubestellar/console/pkg/stellar/providers"
	"github.com/kubestellar/console/pkg/store"
)

func (h *StellarHandler) ListProviders(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	global := h.providerRegistry.ListProviderInfo(c.UserContext())
	userItems := make([]store.StellarProviderConfig, 0)
	if providerStore, ok := h.store.(interface {
		GetUserProviderConfigs(context.Context, string) ([]store.StellarProviderConfig, error)
	}); ok {
		items, _ := providerStore.GetUserProviderConfigs(c.UserContext(), userID)
		for i := range items {
			if len(items[i].APIKeyEnc) > 0 {
				if raw, err := providers.DecryptAPIKey(items[i].APIKeyEnc); err == nil {
					items[i].APIKeyMask = providers.MaskAPIKey(raw)
				}
			}
		}
		userItems = items
	}
	return c.JSON(fiber.Map{"global": global, "user": userItems})
}

func parseCIDRs(rawCIDRs []string) ([]*net.IPNet, error) {
	nets := make([]*net.IPNet, 0, len(rawCIDRs))
	for _, raw := range rawCIDRs {
		cidr := strings.TrimSpace(raw)
		if cidr == "" {
			continue
		}
		_, ipnet, err := net.ParseCIDR(cidr)
		if err != nil {
			return nil, fmt.Errorf("invalid CIDR %q", cidr)
		}
		nets = append(nets, ipnet)
	}
	return nets, nil
}

func loadStellarOllamaAllowedCIDRs() ([]*net.IPNet, error) {
	raw := strings.TrimSpace(os.Getenv(stellarOllamaAllowedCIDRsEnv))
	if raw == "" {
		return parseCIDRs([]string{"127.0.0.0/8", "::1/128"})
	}
	return parseCIDRs(strings.Split(raw, ","))
}

func resolveStellarProviderHostIPs(host string) ([]net.IP, error) {
	if parsed := net.ParseIP(host); parsed != nil {
		return []net.IP{parsed}, nil
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve host")
	}
	if len(ips) == 0 {
		return nil, fmt.Errorf("host resolved to no addresses")
	}
	return ips, nil
}

func ipInCIDRs(ip net.IP, cidrs []*net.IPNet) bool {
	for _, cidr := range cidrs {
		if cidr.Contains(ip) {
			return true
		}
	}
	return false
}

func validateStellarProviderBaseURL(provider, rawBaseURL string) (string, error) {
	baseURL := strings.TrimSpace(rawBaseURL)
	if baseURL == "" {
		return "", nil
	}
	if len(baseURL) > stellarMaxProviderBaseURLLen {
		return "", fmt.Errorf("base URL too long")
	}
	if strings.ContainsAny(baseURL, " \t\n\r") {
		return "", fmt.Errorf("base URL must not contain whitespace")
	}

	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid base URL")
	}
	if parsed.User != nil {
		return "", fmt.Errorf("base URL must not include user credentials")
	}
	host := parsed.Hostname()
	if host == "" {
		return "", fmt.Errorf("base URL must include a host")
	}
	providerName := strings.ToLower(strings.TrimSpace(provider))

	if providerName == "ollama" {
		if parsed.Scheme != "http" {
			return "", fmt.Errorf("ollama base URL must use http://")
		}
		allowedCIDRs, err := loadStellarOllamaAllowedCIDRs()
		if err != nil {
			return "", fmt.Errorf("invalid %s", stellarOllamaAllowedCIDRsEnv)
		}
		ips, err := resolveStellarProviderHostIPs(host)
		if err != nil {
			return "", err
		}
		for _, ip := range ips {
			if !ipInCIDRs(ip, allowedCIDRs) {
				return "", fmt.Errorf("ollama host IP %s not in %s", ip.String(), stellarOllamaAllowedCIDRsEnv)
			}
		}
		return strings.TrimRight(baseURL, "/"), nil
	}

	if parsed.Scheme != "https" {
		return "", fmt.Errorf("cloud provider base URL must use https://")
	}
	lowerHost := strings.ToLower(host)
	if lowerHost == "localhost" || lowerHost == "metadata.google.internal" ||
		strings.HasSuffix(lowerHost, ".internal") || strings.HasSuffix(lowerHost, ".local") {
		return "", fmt.Errorf("cloud provider base URL cannot use internal hostnames")
	}
	ips, err := resolveStellarProviderHostIPs(host)
	if err != nil {
		return "", err
	}
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return "", fmt.Errorf("cloud provider host resolves to blocked IP")
		}
	}
	return strings.TrimRight(baseURL, "/"), nil
}

func (h *StellarHandler) CreateProvider(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	var req struct {
		Provider    string `json:"provider"`
		DisplayName string `json:"displayName"`
		APIKey      string `json:"apiKey"`
		Model       string `json:"model"`
		BaseURL     string `json:"baseUrl"`
	}
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid JSON"})
	}
	validatedBaseURL, err := validateStellarProviderBaseURL(req.Provider, req.BaseURL)
	if err != nil {
		slog.Warn("stellar: invalid baseUrl", "error", err, "userID", userID, "provider", req.Provider)
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid baseUrl"})
	}
	upsert, ok := h.store.(interface {
		UpsertProviderConfig(context.Context, *store.StellarProviderConfig) error
	})
	if !ok {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "provider store unavailable"})
	}
	keyEnc := []byte{}
	if strings.TrimSpace(req.APIKey) != "" {
		enc, err := providers.EncryptAPIKey(strings.TrimSpace(req.APIKey))
		if err != nil {
			slog.Error("stellar: API key encryption failed", "error", err, "userID", userID)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to encrypt API key"})
		}
		keyEnc = enc
	}
	cfg := &store.StellarProviderConfig{
		UserID:      userID,
		Provider:    strings.TrimSpace(req.Provider),
		DisplayName: strings.TrimSpace(req.DisplayName),
		BaseURL:     validatedBaseURL,
		Model:       strings.TrimSpace(req.Model),
		APIKeyEnc:   keyEnc,
		IsActive:    true,
	}
	if err := upsert.UpsertProviderConfig(c.UserContext(), cfg); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to save provider"})
	}
	cfg.APIKeyMask = providers.MaskAPIKey(req.APIKey)
	return c.Status(fiber.StatusCreated).JSON(cfg)
}

func (h *StellarHandler) DeleteProvider(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	id := strings.TrimSpace(c.Params("id"))
	del, ok := h.store.(interface {
		DeleteProviderConfig(context.Context, string, string) error
	})
	if !ok {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "provider store unavailable"})
	}
	if err := del.DeleteProviderConfig(c.UserContext(), id, userID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "delete failed"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StellarHandler) SetDefaultProvider(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	id := strings.TrimSpace(c.Params("id"))
	setter, ok := h.store.(interface {
		SetUserDefaultProvider(context.Context, string, string) error
	})
	if !ok {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "provider store unavailable"})
	}
	if err := setter.SetUserDefaultProvider(c.UserContext(), userID, id); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to set default"})
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *StellarHandler) TestProvider(c *fiber.Ctx) error {
	userID, err := h.requireUser(c)
	if err != nil {
		return err
	}
	id := strings.TrimSpace(c.Params("id"))
	providerStore, ok := h.store.(interface {
		GetUserProviderConfigs(context.Context, string) ([]store.StellarProviderConfig, error)
		UpdateProviderLatency(context.Context, string, int) error
	})
	if !ok {
		return c.Status(fiber.StatusNotImplemented).JSON(fiber.Map{"error": "provider store unavailable"})
	}
	configs, err := providerStore.GetUserProviderConfigs(c.UserContext(), userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to load provider config"})
	}
	var cfg *store.StellarProviderConfig
	for i := range configs {
		if configs[i].ID == id {
			cfg = &configs[i]
			break
		}
	}
	if cfg == nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "provider not found"})
	}
	rawKey := ""
	if len(cfg.APIKeyEnc) > 0 {
		rawKey, err = providers.DecryptAPIKey(cfg.APIKeyEnc)
		if err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid encrypted API key"})
		}
	}
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = providers.ProviderDefaults[cfg.Provider].BaseURL
	}
	validatedBaseURL, err := validateStellarProviderBaseURL(cfg.Provider, baseURL)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid provider baseUrl"})
	}
	var p providers.Provider
	if cfg.Provider == "anthropic" {
		p = providers.NewAnthropicProvider(rawKey)
	} else if cfg.Provider == "ollama" {
		p = providers.NewOllama(validatedBaseURL)
	} else {
		p = providers.NewOpenAICompat(validatedBaseURL, rawKey, cfg.Provider)
	}
	testCtx, cancel := context.WithTimeout(c.UserContext(), 10*time.Second)
	defer cancel()
	health := p.Health(testCtx)
	_ = providerStore.UpdateProviderLatency(c.UserContext(), cfg.ID, health.LatencyMs)
	var safeErr string
	if health.Error != "" {
		slog.Error("[Stellar] provider health check failed", "provider", cfg.Provider, "error", health.Error)
		safeErr = "provider connection test failed"
	}
	return c.JSON(fiber.Map{"available": health.Available, "latencyMs": health.LatencyMs, "error": safeErr})
}
