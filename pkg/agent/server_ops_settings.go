package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/settings"
)

func (s *Server) handleSettingsKeys(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for settings keys endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case "GET":
		s.handleGetKeysStatus(w, r)
	case "POST":
		s.handleSetKey(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "GET or POST required"})
	}
}

// handleSettingsKeyByProvider handles DELETE for /settings/keys/:provider
func (s *Server) handleSettingsKeyByProvider(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodDelete, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for settings key deletion endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "DELETE" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "DELETE required"})
		return
	}

	// Extract provider from URL path: /settings/keys/claude -> claude
	provider := strings.TrimPrefix(r.URL.Path, "/settings/keys/")
	if provider == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "missing_provider", Message: "Provider name required"})
		return
	}

	cm := GetConfigManager()

	// Check if key is from environment variable (can't delete those)
	if cm.IsFromEnv(provider) {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{
			Code:    "env_key",
			Message: "Cannot delete API key set via environment variable. Unset the environment variable instead.",
		})
		return
	}

	if err := cm.RemoveAPIKey(provider); err != nil {
		slog.Error("delete API key error", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "delete_failed", Message: "failed to delete API key"})
		return
	}

	// Invalidate cached validity
	cm.InvalidateKeyValidity(provider)

	// Refresh provider availability
	s.refreshProviderAvailability()

	slog.Info("API key removed", "provider", provider)
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// handleSettingsAll handles GET and PUT for /settings (persists to ~/.kc/settings.json)
func (s *Server) handleSettingsAll(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPut, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for settings endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sm := settings.GetSettingsManager()

	switch r.Method {
	case "GET":
		all, err := sm.GetAll()
		if err != nil {
			slog.Error("[settings] GetAll error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "settings_load_failed", Message: "Failed to load settings"})
			return
		}
		json.NewEncoder(w).Encode(all)

	case "PUT":
		defer r.Body.Close()
		body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBodyBytes))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "read_error", Message: "Failed to read request body"})
			return
		}

		var all settings.AllSettings
		if err := json.Unmarshal(body, &all); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_body", Message: "Invalid request body"})
			return
		}

		if err := sm.SaveAll(&all); err != nil {
			slog.Error("[settings] SaveAll error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "settings_save_failed", Message: "Failed to save settings"})
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Settings saved"})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "GET or PUT required"})
	}
}

// handleSettingsExport handles POST for /settings/export (returns encrypted backup)
func (s *Server) handleSettingsExport(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for settings export endpoint
	if !s.validateToken(r) {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	sm := settings.GetSettingsManager()
	data, err := sm.ExportEncrypted()
	if err != nil {
		slog.Error("[settings] export error", "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "export_failed", Message: "Failed to export settings"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=kc-settings-backup.json")
	w.Write(data)
}

// handleSettingsImport handles PUT/POST for /settings/import (imports encrypted backup)
func (s *Server) handleSettingsImport(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPut, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// SECURITY: Validate token for settings import endpoint
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "PUT" && r.Method != "POST" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "method_not_allowed", Message: "PUT or POST required"})
		return
	}

	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBodyBytes))
	if err != nil || len(body) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "empty_body", Message: "Empty request body"})
		return
	}

	sm := settings.GetSettingsManager()
	if err := sm.ImportEncrypted(body); err != nil {
		slog.Error("[settings] import error", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "import_failed", Message: "failed to import settings"})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{"success": true, "message": "Settings imported"})
}

// handleGetKeysStatus returns the status of all API keys (without exposing the actual keys).
//
// The list covers the nine chat-only HTTP providers registered in
// InitializeProviders (pkg/agent/registry.go): three OpenAI-compatible
// gateway providers (Groq, OpenRouter, Open WebUI) and six local LLM
// runners (Ollama, llama.cpp, LocalAI, vLLM, LM Studio, Red Hat AI
// Inference Server). CLI-based tool-capable agents (claude-code, bob,
// codex, gemini-cli, antigravity, goose, copilot-cli) are deliberately
// omitted — they manage their own credentials and do not need an API
// key in ~/.kc/config.yaml.
//
// Each entry includes the current BaseURL + BaseURLEnvVar so the
// frontend Settings modal can offer a per-provider base URL override
// field without needing to hardcode the mapping.
func (s *Server) handleGetKeysStatus(w http.ResponseWriter, r *http.Request) {
	cm := GetConfigManager()

	type providerDef struct {
		name        string
		displayName string
		// validationRequired is true for providers that have a working
		// validation endpoint (Groq, OpenRouter). Local LLM runners
		// typically have no authentication, so attempting to validate
		// their placeholder sentinel key against a real endpoint is
		// pointless — we report Configured=true whenever a URL is set.
		validationRequired bool
		// isLocalLLM marks URL-driven providers (Ollama, llama.cpp, etc.)
		// whose "configured" status is derived from URL presence rather
		// than API key presence. This also drives the BaseURL resolution
		// to include compiled-in defaults so the UI shows the current
		// effective endpoint (#8259).
		isLocalLLM bool
		// defaultURL is the compiled-in loopback URL (e.g. Ollama on
		// 127.0.0.1:11434). Empty for providers with no default.
		defaultURL string
	}

	providers := []providerDef{
		// OpenAI-compatible gateways with real API keys
		{name: "groq", displayName: "Groq", validationRequired: true},
		{name: "openrouter", displayName: "OpenRouter", validationRequired: true},
		{name: "open-webui", displayName: "Open WebUI", validationRequired: false},
		// Local LLM runners — URL-driven, no API key by default.
		// isLocalLLM=true changes Configured semantics: URL-present counts.
		{name: ProviderKeyOllama, displayName: "Ollama (Local)", isLocalLLM: true, defaultURL: defaultOllamaURL},
		{name: ProviderKeyLlamaCpp, displayName: "llama.cpp (Local)", isLocalLLM: true},
		{name: ProviderKeyLocalAI, displayName: "LocalAI (Local)", isLocalLLM: true},
		{name: ProviderKeyVLLM, displayName: "vLLM (Local)", isLocalLLM: true},
		{name: ProviderKeyLMStudio, displayName: "LM Studio (Local)", isLocalLLM: true, defaultURL: defaultLMStudioURL},
		{name: ProviderKeyRHAIIS, displayName: "Red Hat AI Inference Server", isLocalLLM: true},
	}

	keys := make([]KeyStatus, 0, len(providers))
	for _, p := range providers {
		status := KeyStatus{
			Provider:    p.name,
			DisplayName: p.displayName,
			Configured:  cm.HasAPIKey(p.name),
		}

		// Base URL metadata — surfaces the fully-resolved value (env →
		// config → compiled default) and the env var name so the UI can
		// render an Advanced expandable section.
		status.BaseURL = cm.GetBaseURL(p.name)
		status.BaseURLEnvVar = getBaseURLEnvKeyForProvider(p.name)
		if status.BaseURLEnvVar != "" && os.Getenv(status.BaseURLEnvVar) != "" {
			status.BaseURLSource = "env"
		} else if status.BaseURL != "" {
			status.BaseURLSource = "config"
		}
		// For local LLM runners, fall through to the compiled-in default
		// so the UI always shows the effective endpoint (#8259). Leave
		// BaseURLSource empty here — per KeyStatus docs, empty signals
		// "the resolved value is the compiled-in default" (the UI treats
		// empty as "default" without needing a separate enum value).
		if p.isLocalLLM && status.BaseURL == "" && p.defaultURL != "" {
			status.BaseURL = p.defaultURL
		}
		// Local LLM runners are "configured" when a URL is reachable —
		// either via env/config override or compiled-in default. Having
		// only a sentinel placeholder API key is not enough (#8259).
		if p.isLocalLLM {
			status.Configured = status.BaseURL != ""
		}

		if status.Configured {
			if cm.IsFromEnv(p.name) {
				status.Source = "env"
			} else {
				status.Source = "config"
			}

			if p.validationRequired {
				// Test if the key is valid — validateAPIKey honors the
				// base URL override via the per-provider resolver, so
				// pointing a Groq config at a local Ollama validates
				// against the local endpoint.
				valid, err := s.validateAPIKey(p.name)
				status.Valid = &valid
				cm.SetKeyValidity(p.name, valid)
				if err != nil {
					slog.Error("API key validation error", "provider", p.name, "error", err)
					status.Error = "validation failed"
				}
			}
		}

		keys = append(keys, status)
	}

	// Include the live provider registry so the frontend settings UI can
	// filter its display to only show providers that are actually
	// registered in the backend, eliminating the hardcoded mismatch (#9488).
	listRegistry := s.registry
	if listRegistry == nil {
		listRegistry = GetRegistry()
	}
	registeredProviders := listRegistry.List()

	json.NewEncoder(w).Encode(KeysStatusResponse{
		Keys:                keys,
		ConfigPath:          cm.GetConfigPath(),
		RegisteredProviders: registeredProviders,
	})
}

// handleSetKey saves an API key, a model preference, a base URL override,
// or any combination of the three for a provider. Setting BaseURL alone
// (no APIKey) is the common path for unauthenticated local LLM runners —
// operators point Ollama at a LAN server by saving `OLLAMA_URL` via this
// endpoint rather than editing a shell profile.
func (s *Server) handleSetKey(w http.ResponseWriter, r *http.Request) {
	var req SetKeyRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, maxRequestBodyBytes)).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_json", Message: "Invalid JSON body"})
		return
	}

	if req.Provider == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "missing_provider", Message: "Provider name required"})
		return
	}

	// Reject unknown provider names so typos don't create orphaned config
	// entries (#10060). Prefer the server's injected registry so tests
	// validate against the active provider set for this server instance.
	registry := s.registry
	if registry == nil {
		registry = GetRegistry()
	}
	if _, err := registry.Get(req.Provider); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "unknown_provider", Message: fmt.Sprintf("Provider %q is not registered", req.Provider)})
		return
	}

	// At least one actionable field must be present — a request with none
	// is a programming bug we should reject rather than silently store
	// nothing. ClearBaseURL counts as actionable (it reverts the URL to
	// the compiled-in default).
	if req.APIKey == "" && req.BaseURL == "" && req.Model == "" && !req.ClearBaseURL {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "missing_field", Message: "At least one of apiKey, baseURL, model, or clearBaseURL is required"})
		return
	}

	cm := GetConfigManager()

	// Base URL can be saved independently and does not need validation —
	// operators point at local runners that the reachability/validation
	// check cannot test meaningfully (the sentinel "local-llm-no-auth" key
	// is not a real credential). Save first so that subsequent API-key
	// validation below uses the updated endpoint.
	if req.BaseURL != "" {
		if err := validateBaseURL(req.BaseURL); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_base_url", Message: err.Error()})
			return
		}
		if err := cm.SetBaseURL(req.Provider, req.BaseURL); err != nil {
			slog.Error("save base URL error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "save_failed", Message: "failed to save base URL"})
			return
		}
		// Invalidate cached validity for this provider — the endpoint
		// changed, so any previously-cached "key valid" result is stale.
		cm.InvalidateKeyValidity(req.Provider)
	} else if req.ClearBaseURL {
		// Explicit clear: remove the persisted base URL override so the
		// provider reverts to its compiled-in default URL (#8259).
		if err := cm.RemoveBaseURL(req.Provider); err != nil {
			slog.Error("clear base URL error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "save_failed", Message: "failed to clear base URL"})
			return
		}
		cm.InvalidateKeyValidity(req.Provider)
	}

	if req.APIKey != "" {
		// Validate the key before saving. Validation uses the provider's
		// now-current base URL, so pointing Groq at a local Ollama works.
		valid, validationErr := s.validateAPIKeyValue(req.Provider, req.APIKey)
		if !valid {
			w.WriteHeader(http.StatusBadRequest)
			if validationErr != nil {
				slog.Error("API key validation error", "error", validationErr)
			}
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_key", Message: "Invalid API key"})
			return
		}

		if err := cm.SetAPIKey(req.Provider, req.APIKey); err != nil {
			slog.Error("save API key error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "save_failed", Message: "failed to save API key"})
			return
		}

		cm.SetKeyValidity(req.Provider, true)
	}

	// Save model if provided
	if req.Model != "" {
		if err := cm.SetModel(req.Provider, req.Model); err != nil {
			slog.Error("failed to save model preference", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "save_failed", Message: "failed to save model preference"})
			return
		}
	}

	// Refresh provider availability
	s.refreshProviderAvailability()

	slog.Info("provider configured", "provider", req.Provider, "hasKey", req.APIKey != "", "hasBaseURL", req.BaseURL != "", "hasModel", req.Model != "")
	json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"provider": req.Provider,
	})
}

// validateBaseURL performs a syntactic check on a base URL before it is
// saved. This is not a reachability test — local runners may not be
// running at the time the operator configures them. The goal is only to
// reject obvious typos (missing scheme, whitespace, non-http(s) scheme).
func validateBaseURL(s string) error {
	s = strings.TrimSpace(s)
	if s == "" {
		return fmt.Errorf("base URL is empty")
	}
	if strings.ContainsAny(s, " \t\n\r") {
		return fmt.Errorf("base URL must not contain whitespace")
	}
	if !strings.HasPrefix(s, "http://") && !strings.HasPrefix(s, "https://") {
		return fmt.Errorf("base URL must start with http:// or https://")
	}
	return nil
}

// validateAPIKey tests if the configured key for a provider works
func (s *Server) validateAPIKey(provider string) (bool, error) {
	cm := GetConfigManager()
	apiKey := cm.GetAPIKey(provider)
	if apiKey == "" {
		return false, fmt.Errorf("no API key configured")
	}
	return s.validateAPIKeyValue(provider, apiKey)
}

// validateAPIKeyValue tests if a specific API key value works
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
		// For IDE/app providers (cursor, windsurf, cline, etc.)
		// we accept the key without validation since we don't have
		// validation endpoints for all providers
		if apiKey != "" {
			return true, nil
		}
		return false, fmt.Errorf("empty API key for provider: %s", provider)
	}
}

// refreshProviderAvailability is intentionally a no-op after config mutations.
// In-memory config is already authoritative after SetAPIKey/SetModel/RemoveAPIKey/SetBaseURL/RemoveBaseURL.
// Calling Load() would re-read a potentially stale disk file and overwrite
// concurrent in-memory writes, causing silent API key loss under concurrent requests.
// Providers check availability on each request, so no explicit reload is needed.
func (s *Server) refreshProviderAvailability() {
}

// perKeyValidationTimeout is the timeout for each individual API key validation request.
const perKeyValidationTimeout = 15 * time.Second

// apiKeyValidationClient is an HTTP client with a timeout for external API key
// validation calls. Using http.DefaultClient would hang indefinitely if a
// provider is slow or unresponsive.
var apiKeyValidationClient = &http.Client{Timeout: 30 * time.Second}

// maxConcurrentValidations limits how many provider keys are validated simultaneously
// to avoid hammering all providers at once.
const maxConcurrentValidations = 5

// ValidateAllKeys validates all configured API keys and caches results.
// Validations run in parallel (bounded by maxConcurrentValidations) to avoid
// sequential delays on startup when many providers are configured.
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
		// Check if we already know the validity
		if valid := cm.IsKeyValid(provider); valid != nil {
			continue // Already validated
		}

		wg.Add(1)
		go func(p string) {
			defer wg.Done()
			sem <- struct{}{}        // acquire semaphore slot
			defer func() { <-sem }() // release semaphore slot

			slog.Info("validating API key", "provider", p)
			valid, err := s.validateAPIKey(p)

			mu.Lock()
			defer mu.Unlock()

			if err != nil {
				// Network or other error - don't cache, will try again later
				slog.Error("API key validation error (will retry)", "provider", p, "error", err)
			} else {
				// Cache the validity result
				cm.SetKeyValidity(p, valid)
				if valid {
					slog.Info("API key is valid", "provider", p)
				} else {
					slog.Warn("API key is INVALID", "provider", p)
				}
			}
		}(provider)
	}

	wg.Wait()
}

// validateClaudeKey tests an Anthropic API key
func validateClaudeKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", claudeAPIURL, strings.NewReader(`{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}`))
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

	// 200 = valid, 401 = invalid key (return false with no error)
	// For other errors, return error so we don't cache invalid state
	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return false, nil // Invalid key - no error so it gets cached
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
	return false, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
}

// validateOpenAIKey tests an OpenAI API key
func validateOpenAIKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://api.openai.com/v1/models", nil)
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
		// Invalid key — return (false, nil) so ValidateAllKeys caches the
		// result and doesn't re-fire a live /v1/models request on every
		// kc-agent startup (#7923). Matches validateClaudeKey behavior.
		return false, nil
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
	return false, fmt.Errorf("API error: %s", string(body))
}

// openRouterDefaultValidationURL is the public OpenRouter models listing
// endpoint. It returns 200 for any valid API key and 401 otherwise, so it's a
// cheap way to check credentials without spending tokens on a chat completion.
// When OPENROUTER_BASE_URL is set, the validation request is redirected to
// that base URL's /models endpoint so operators with a self-hosted or corporate
// OpenRouter proxy validate against their own endpoint, not the public one.
const openRouterDefaultValidationURL = "https://openrouter.ai/api/v1/models"

// openRouterValidationURL resolves the validation URL at call time so a
// runtime OPENROUTER_BASE_URL override is honored.
func openRouterValidationURL() string {
	if base := os.Getenv("OPENROUTER_BASE_URL"); base != "" {
		return strings.TrimRight(base, "/") + "/models"
	}
	return openRouterDefaultValidationURL
}

// validateOpenRouterKey tests an OpenRouter API key by hitting the models
// listing endpoint. Mirrors validateOpenAIKey semantics: a 200 means valid,
// 401 means invalid (cached as (false, nil) so we don't re-fire on every
// startup — see #7923).
func validateOpenRouterKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", openRouterValidationURL(), nil)
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

// validateGroqKey tests a Groq API key by hitting the OpenAI-compatible
// models listing endpoint. Mirrors validateOpenAIKey semantics: a 200 means
// valid, 401 means invalid (cached as (false, nil) so we don't re-fire on
// every startup — see #7923).
func validateGroqKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", groqValidationURL(), nil)
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

// validateGeminiKey tests a Google Gemini API key
func validateGeminiKey(ctx context.Context, apiKey string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", geminiAPIBaseURL, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("x-goog-api-key", apiKey)

	resp, err := apiKeyValidationClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	// Gemini returns 200 for valid keys (lists models)
	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		// Invalid key — return (false, nil) so ValidateAllKeys caches the
		// result instead of re-firing a live ListModels request on every
		// kc-agent startup (#7923). Matches validateClaudeKey behavior.
		return false, nil
	}
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
	if readErr != nil {
		body = []byte("(failed to read response body)")
	}
	return false, fmt.Errorf("API error: %s", string(body))
}

// ============================================================================
// Provider Health Check (proxies status page checks to avoid browser CORS)
// ============================================================================

// providerStatusPageAPI maps provider IDs to their Statuspage.io JSON API URLs
var providerStatusPageAPI = map[string]string{
	"anthropic": "https://status.claude.com/api/v2/status.json",
	"openai":    "https://status.openai.com/api/v2/status.json",
}

// providerPingEndpoints maps provider IDs to API endpoints for reachability checks.
// Any HTTP response (even 400/401) means the service is up.
var providerPingEndpoints = map[string]string{
	"google": "https://generativelanguage.googleapis.com/v1beta/models?key=healthcheck",
}

// ProviderHealthStatus represents the health of a single provider service
type ProviderHealthStatus struct {
	ID     string `json:"id"`
	Status string `json:"status"` // "operational", "degraded", "down", "unknown"
}

// ProvidersHealthResponse is returned by GET /providers/health
type ProvidersHealthResponse struct {
	Providers []ProviderHealthStatus `json:"providers"`
	CheckedAt string                 `json:"checkedAt"`
}

func (s *Server) handleProvidersHealth(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != "GET" {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	// Check all providers in parallel
	var wg sync.WaitGroup
	var mu sync.Mutex
	totalProviders := len(providerStatusPageAPI) + len(providerPingEndpoints)
	results := make([]ProviderHealthStatus, 0, totalProviders)

	client := &http.Client{Timeout: consoleHealthTimeout}

	// Statuspage.io providers (Anthropic, OpenAI)
	for id, apiURL := range providerStatusPageAPI {
		wg.Add(1)
		go func(providerID, url string) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					slog.Error("[ProviderHealth] recovered from panic checking provider", "provider", providerID, "panic", r)
				}
			}()
			status := checkStatuspageHealth(client, url)
			mu.Lock()
			results = append(results, ProviderHealthStatus{ID: providerID, Status: status})
			mu.Unlock()
		}(id, apiURL)
	}

	// Ping-based providers (Google) — any HTTP response = operational
	for id, pingURL := range providerPingEndpoints {
		wg.Add(1)
		go func(providerID, url string) {
			defer wg.Done()
			defer func() {
				if r := recover(); r != nil {
					slog.Error("[ProviderHealth] recovered from panic pinging provider", "provider", providerID, "panic", r)
				}
			}()
			status := checkPingHealth(client, url)
			mu.Lock()
			results = append(results, ProviderHealthStatus{ID: providerID, Status: status})
			mu.Unlock()
		}(id, pingURL)
	}

	wg.Wait()

	resp := ProvidersHealthResponse{
		Providers: results,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	}
	json.NewEncoder(w).Encode(resp)
}

// checkStatuspageHealth fetches a Statuspage.io JSON API and returns a health status string
func checkStatuspageHealth(client *http.Client, apiURL string) string {
	resp, err := client.Get(apiURL)
	if err != nil {
		return "unknown"
	}
	defer func() {
		io.Copy(io.Discard, resp.Body)
		resp.Body.Close()
	}()

	if resp.StatusCode != http.StatusOK {
		return "unknown"
	}

	var data struct {
		Status struct {
			Indicator string `json:"indicator"`
		} `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "unknown"
	}

	switch data.Status.Indicator {
	case "none":
		return "operational"
	case "minor", "major":
		return "degraded"
	case "critical":
		return "down"
	default:
		return "unknown"
	}
}

// checkPingHealth tests reachability of a provider API endpoint.
// Any HTTP response (even 400/401/403) means the service is operational.
// Only a connection failure indicates the service is down.
func checkPingHealth(client *http.Client, pingURL string) string {
	resp, err := client.Get(pingURL)
	if err != nil {
		return "down"
	}
	defer resp.Body.Close()
	return "operational"
}

// =============================================================================
// Prediction Handlers
// =============================================================================
