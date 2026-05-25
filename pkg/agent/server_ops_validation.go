package agent

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
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

var privateIPNets = func() []*net.IPNet {
	cidrs := []string{
		"10.0.0.0/8",
		"172.16.0.0/12",
		"192.168.0.0/16",
		"127.0.0.0/8",
		"169.254.0.0/16",
		"::1/128",
		"fc00::/7",
		"fe80::/10",
	}
	nets := make([]*net.IPNet, 0, len(cidrs))
	for _, cidr := range cidrs {
		_, network, _ := net.ParseCIDR(cidr)
		nets = append(nets, network)
	}
	return nets
}()

func isPrivateIP(ip net.IP) bool {
	for _, network := range privateIPNets {
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

func allowLocalProviders() bool {
	return os.Getenv("ALLOW_LOCAL_PROVIDERS") == "true"
}

func validateBaseURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fmt.Errorf("base URL is empty")
	}
	if strings.ContainsAny(raw, " \t\n\r") {
		return fmt.Errorf("base URL must not contain whitespace")
	}
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		return fmt.Errorf("base URL must start with http:// or https://")
	}
	if allowLocalProviders() {
		return nil
	}

	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("malformed URL: %w", err)
	}
	host := u.Hostname()

	const baseURLDNSLookupTimeout = 3 * time.Second
	lookupCtx, cancel := context.WithTimeout(context.Background(), baseURLDNSLookupTimeout)
	defer cancel()

	ips, err := net.DefaultResolver.LookupHost(lookupCtx, host)
	if err != nil {
		if ip := net.ParseIP(host); ip != nil && isPrivateIP(ip) {
			return fmt.Errorf("base URL resolves to a private/internal IP address")
		}
		return nil
	}
	for _, ipStr := range ips {
		if ip := net.ParseIP(ipStr); ip != nil && isPrivateIP(ip) {
			return fmt.Errorf("base URL resolves to a private/internal IP address")
		}
	}
	return nil
}

func (s *Server) validateAPIKey(provider string) (bool, error) {
	apiKey := GetConfigManager().GetAPIKey(provider)
	if apiKey == "" {
		return false, fmt.Errorf("no API key configured")
	}
	return s.validateAPIKeyValue(provider, apiKey)
}

func (s *Server) validateAPIKeyValue(provider, apiKey string) (bool, error) {
	if s.SkipKeyValidation {
		return true, nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), perKeyValidationTimeout)
	defer cancel()

	switch provider {
	case "claude", "anthropic":
		return validateClaudeKey(ctx, apiKey)
	case "openai":
		return validateOpenAIKey(ctx, apiKey)
	case "gemini", "google":
		return validateGeminiKey(ctx, apiKey)
	case "openrouter":
		return validateOpenRouterKey(ctx, apiKey)
	case "groq":
		return validateGroqKey(ctx, apiKey)
	default:
		if apiKey != "" {
			return true, nil
		}
		return false, fmt.Errorf("empty API key for provider: %s", provider)
	}
}

const perKeyValidationTimeout = 15 * time.Second

var apiKeyValidationClient = &http.Client{Timeout: 30 * time.Second}

const maxConcurrentValidations = 5

func (s *Server) ValidateAllKeys() {
	cm := GetConfigManager()
	providers := []string{"claude", "openai", "gemini", "openrouter", "groq", "cursor", "vscode", "windsurf", "cline", "jetbrains", "zed", "continue", "raycast", "open-webui"}

	var wg sync.WaitGroup
	var mu sync.Mutex
	sem := make(chan struct{}, maxConcurrentValidations)

	for _, provider := range providers {
		if !cm.HasAPIKey(provider) {
			continue
		}
		if valid := cm.IsKeyValid(provider); valid != nil {
			continue
		}

		providerName := provider
		wg.Add(1)
		safego.GoWith("validate-api-key/"+providerName, func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			slog.Info("validating API key", "provider", providerName)
			valid, err := s.validateAPIKey(providerName)

			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				slog.Error("API key validation error (will retry)", "provider", providerName, "error", err)
				return
			}
			cm.SetKeyValidity(providerName, valid)
			if valid {
				slog.Info("API key is valid", "provider", providerName)
			} else {
				slog.Warn("API key is INVALID", "provider", providerName)
			}
		})
	}

	wg.Wait()
}

func validateClaudeKey(ctx context.Context, apiKey string) (bool, error) {
	baseURL := GetConfigManager().GetBaseURL("claude")
	if baseURL == "" {
		baseURL = "https://api.anthropic.com/v1"
	}
	model := GetConfigManager().GetModel("claude", "claude-3-haiku-20240307")
	body := fmt.Sprintf(`{"model":%q,"max_tokens":1,"messages":[{"role":"user","content":"hi"}]}`, model)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/messages", strings.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", apiKey)
	req.Header.Set("anthropic-version", claudeAPIVersion)

	resp, err := apiKeyValidationClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return false, nil
	}
	respBody, readErr := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
	if readErr != nil {
		respBody = []byte("(failed to read response body)")
	}
	return false, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(respBody))
}

func validateOpenAIKey(ctx context.Context, apiKey string) (bool, error) {
	baseURL := GetConfigManager().GetBaseURL("openai")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/models", nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := apiKeyValidationClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return false, nil
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
	return false, fmt.Errorf("API error: %s", string(body))
}

const openRouterDefaultValidationURL = "https://openrouter.ai/api/v1/models"

func openRouterValidationURL() string {
	if baseURL := os.Getenv("OPENROUTER_BASE_URL"); baseURL != "" {
		return strings.TrimRight(baseURL, "/") + "/models"
	}
	return openRouterDefaultValidationURL
}

func validateOpenRouterKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openRouterValidationURL(), nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := apiKeyValidationClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return false, nil
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
	return false, fmt.Errorf("API error: %s", string(body))
}

func validateGroqKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, groqValidationURL(), nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := apiKeyValidationClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return false, nil
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
	return false, fmt.Errorf("API error: %s", string(body))
}

func validateGeminiKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, geminiAPIBaseURL, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("x-goog-api-key", apiKey)

	resp, err := apiKeyValidationClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return false, nil
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
	return false, fmt.Errorf("API error: %s", string(body))
}
