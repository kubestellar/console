package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/settings"
)

func (s *Server) handleSettingsKeys(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "PUT, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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

// handleGetKeysStatus returns the status of all API keys (without exposing the actual keys)
func (s *Server) handleGetKeysStatus(w http.ResponseWriter, r *http.Request) {
	cm := GetConfigManager()

	// Build provider list dynamically from registry
	// Include all providers that accept API keys (exclude pure CLI providers like bob, claude-code)
	type providerDef struct {
		name        string
		displayName string
	}

	// Only show CLI-based agents — API-key-driven agents are hidden because
	// they cannot execute commands to diagnose/repair clusters.
	// This list is intentionally empty; the keys endpoint remains functional
	// for any future API providers but currently returns no keys.
	providers := []providerDef{}

	keys := make([]KeyStatus, 0, len(providers))
	for _, p := range providers {
		status := KeyStatus{
			Provider:    p.name,
			DisplayName: p.displayName,
			Configured:  cm.HasAPIKey(p.name),
		}

		if status.Configured {
			if cm.IsFromEnv(p.name) {
				status.Source = "env"
			} else {
				status.Source = "config"
			}

			// Test if the key is valid
			valid, err := s.validateAPIKey(p.name)
			status.Valid = &valid
			// Cache the validity for IsAvailable() checks
			cm.SetKeyValidity(p.name, valid)
			if err != nil {
				slog.Error("API key validation error", "provider", p.name, "error", err)
				status.Error = "validation failed"
			}
		}

		keys = append(keys, status)
	}

	json.NewEncoder(w).Encode(KeysStatusResponse{
		Keys:       keys,
		ConfigPath: cm.GetConfigPath(),
	})
}

// handleSetKey saves a new API key
func (s *Server) handleSetKey(w http.ResponseWriter, r *http.Request) {
	var req SetKeyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_json", Message: "Invalid JSON body"})
		return
	}

	if req.Provider == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "missing_provider", Message: "Provider name required"})
		return
	}

	if req.APIKey == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "missing_key", Message: "API key required"})
		return
	}

	// Validate the key before saving
	valid, validationErr := s.validateAPIKeyValue(req.Provider, req.APIKey)
	if !valid {
		w.WriteHeader(http.StatusBadRequest)
		if validationErr != nil {
			slog.Error("API key validation error", "error", validationErr)
		}
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "invalid_key", Message: "Invalid API key"})
		return
	}

	cm := GetConfigManager()

	// Save the key
	if err := cm.SetAPIKey(req.Provider, req.APIKey); err != nil {
		slog.Error("save API key error", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(protocol.ErrorPayload{Code: "save_failed", Message: "failed to save API key"})
		return
	}

	// Cache validity (we validated before saving)
	cm.SetKeyValidity(req.Provider, true)

	// Save model if provided
	if req.Model != "" {
		if err := cm.SetModel(req.Provider, req.Model); err != nil {
			slog.Error("failed to save model preference", "error", err)
		}
	}

	// Refresh provider availability
	s.refreshProviderAvailability()

	slog.Info("API key configured", "provider", req.Provider)
	json.NewEncoder(w).Encode(map[string]any{
		"success":  true,
		"provider": req.Provider,
		"valid":    true,
	})
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
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	switch provider {
	case "claude", "anthropic":
		return validateClaudeKey(ctx, apiKey)
	case "openai":
		return validateOpenAIKey(ctx, apiKey)
	case "gemini", "google":
		return validateGeminiKey(ctx, apiKey)
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

// refreshProviderAvailability updates provider availability after key changes
func (s *Server) refreshProviderAvailability() {
	// Re-initialize providers to pick up new keys
	// This is a simple approach - providers check availability on each request anyway
	// For now, we just reload the config
	GetConfigManager().Load()
}

// ValidateAllKeys validates all configured API keys and caches results
// This should be called on server startup to detect invalid keys early
func (s *Server) ValidateAllKeys() {
	cm := GetConfigManager()
	providers := []string{"claude", "openai", "gemini", "cursor", "vscode", "windsurf", "cline", "jetbrains", "zed", "continue", "raycast", "open-webui"}

	for _, provider := range providers {
		if cm.HasAPIKey(provider) {
			// Check if we already know the validity
			if valid := cm.IsKeyValid(provider); valid != nil {
				continue // Already validated
			}
			// Validate the key
			slog.Info("validating API key", "provider", provider)
			valid, err := s.validateAPIKey(provider)
			if err != nil {
				// Network or other error - don't cache, will try again later
				slog.Error("API key validation error (will retry)", "provider", provider, "error", err)
			} else {
				// Cache the validity result
				cm.SetKeyValidity(provider, valid)
				if valid {
					slog.Info("API key is valid", "provider", provider)
				} else {
					slog.Warn("API key is INVALID", "provider", provider)
				}
			}
		}
	}
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

	resp, err := http.DefaultClient.Do(req)
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
	body, readErr := io.ReadAll(resp.Body)
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

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized {
		return false, fmt.Errorf("invalid API key")
	}
	body, readErr := io.ReadAll(resp.Body)
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

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	// Gemini returns 200 for valid keys (lists models)
	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return false, fmt.Errorf("invalid API key")
	}
	body, readErr := io.ReadAll(resp.Body)
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
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
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
					slog.Info("[ProviderHealth] recovered from panic checking provider", "provider", providerID, "panic", r)
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
					slog.Info("[ProviderHealth] recovered from panic pinging provider", "provider", providerID, "panic", r)
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
	defer resp.Body.Close()

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

// handlePredictionsAI returns current AI predictions
func (s *Server) handlePredictionsAI(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.predictionWorker == nil {
		json.NewEncoder(w).Encode(AIPredictionsResponse{
			Predictions: []AIPrediction{},
			Stale:       true,
		})
		return
	}

	json.NewEncoder(w).Encode(s.predictionWorker.GetPredictions())
}

// handlePredictionsAnalyze triggers a manual AI analysis
func (s *Server) handlePredictionsAnalyze(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.predictionWorker == nil {
		http.Error(w, "Prediction worker not available", http.StatusServiceUnavailable)
		return
	}

	// Parse optional providers from request body.
	// SECURITY: reject malformed JSON instead of silently using zero-value (#4156).
	var req AIAnalysisRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid JSON body"})
			return
		}
	}

	if s.predictionWorker.IsAnalyzing() {
		json.NewEncoder(w).Encode(map[string]string{
			"status": "already_running",
		})
		return
	}

	if err := s.predictionWorker.TriggerAnalysis(req.Providers); err != nil {
		slog.Error("prediction analysis error", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]string{
		"status":        "started",
		"estimatedTime": "30s",
	})
}

// PredictionFeedbackRequest represents a feedback submission
type PredictionFeedbackRequest struct {
	PredictionID string `json:"predictionId"`
	Feedback     string `json:"feedback"` // "accurate" or "inaccurate"
}

// handlePredictionsFeedback handles prediction feedback submissions
func (s *Server) handlePredictionsFeedback(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req PredictionFeedbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.PredictionID == "" || (req.Feedback != "accurate" && req.Feedback != "inaccurate") {
		http.Error(w, "Invalid predictionId or feedback", http.StatusBadRequest)
		return
	}

	// For now, just acknowledge - feedback is stored client-side
	// In the future, this could store to a database for model improvement
	slog.Info("[Predictions] feedback received", "predictionID", req.PredictionID, "feedback", req.Feedback)

	json.NewEncoder(w).Encode(map[string]string{
		"status": "recorded",
	})
}

// handlePredictionsStats returns prediction accuracy statistics
func (s *Server) handlePredictionsStats(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Stats are calculated client-side from localStorage
	// This endpoint is for future server-side aggregation
	json.NewEncoder(w).Encode(map[string]interface{}{
		"totalPredictions":   0,
		"accurateFeedback":   0,
		"inaccurateFeedback": 0,
		"accuracyRate":       0.0,
		"byProvider":         map[string]interface{}{},
	})
}

// handleMetricsHistory returns historical metrics for trend analysis
func (s *Server) handleMetricsHistory(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.metricsHistory == nil {
		json.NewEncoder(w).Encode(MetricsHistoryResponse{
			Snapshots: []MetricsSnapshot{},
			Retention: "24h",
		})
		return
	}

	json.NewEncoder(w).Encode(s.metricsHistory.GetSnapshots())
}

// handleDeviceAlerts returns current hardware device alerts
func (s *Server) handleDeviceAlerts(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.deviceTracker == nil {
		json.NewEncoder(w).Encode(DeviceAlertsResponse{
			Alerts:    []DeviceAlert{},
			NodeCount: 0,
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	json.NewEncoder(w).Encode(s.deviceTracker.GetAlerts())
}

// handleDeviceAlertsClear clears a specific device alert
func (s *Server) handleDeviceAlertsClear(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Validate request body before checking device tracker availability so
	// callers always get a 400 for malformed requests regardless of server state.
	var req struct {
		AlertID string `json:"alertId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.AlertID == "" {
		http.Error(w, "alertId is required", http.StatusBadRequest)
		return
	}

	if s.deviceTracker == nil {
		http.Error(w, "Device tracker not available", http.StatusServiceUnavailable)
		return
	}

	cleared := s.deviceTracker.ClearAlert(req.AlertID)
	json.NewEncoder(w).Encode(map[string]bool{"cleared": cleared})
}

func (s *Server) handleDeviceInventory(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.deviceTracker == nil {
		json.NewEncoder(w).Encode(DeviceInventoryResponse{
			Nodes:     []NodeDeviceInventory{},
			Timestamp: time.Now().Format(time.RFC3339),
		})
		return
	}

	response := s.deviceTracker.GetInventory()
	json.NewEncoder(w).Encode(response)
}

// sendNativeNotification sends a native macOS notification for device alerts
func (s *Server) sendNativeNotification(alerts []DeviceAlert) {
	if len(alerts) == 0 {
		return
	}

	// Build notification message
	var title, message string
	if len(alerts) == 1 {
		alert := alerts[0]
		title = fmt.Sprintf("⚠️ Hardware Alert: %s", alert.DeviceType)
		message = fmt.Sprintf("%s on %s/%s: %d → %d",
			alert.DeviceType, alert.Cluster, alert.NodeName,
			alert.PreviousCount, alert.CurrentCount)
	} else {
		critical := 0
		for _, a := range alerts {
			if a.Severity == "critical" {
				critical++
			}
		}
		title = fmt.Sprintf("⚠️ %d Hardware Alerts", len(alerts))
		if critical > 0 {
			message = fmt.Sprintf("%d critical, %d warning - devices have disappeared",
				critical, len(alerts)-critical)
		} else {
			message = fmt.Sprintf("%d devices have disappeared from nodes", len(alerts))
		}
	}

	// Build a deep link URL so clicking the notification opens the console
	consoleURL := fmt.Sprintf("http://localhost:%d/?action=hardware-health", s.config.Port)

	// Prefer terminal-notifier (supports click-to-open via -open flag).
	// Fall back to osascript display notification (no click handler support).
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Info("[DeviceTracker] recovered from panic in notification", "panic", r)
			}
		}()

		if tnPath, err := exec.LookPath("terminal-notifier"); err == nil {
			cmd := exec.Command(tnPath,
				"-title", "KubeStellar Console",
				"-subtitle", title,
				"-message", message,
				"-sound", "Glass",
				"-open", consoleURL,
				"-sender", "com.google.Chrome",
			)
			if err := cmd.Run(); err != nil {
				slog.Error("[DeviceTracker] terminal-notifier failed, falling back to osascript", "error", err)
			} else {
				return
			}
		}

		// Fallback: osascript (no click-to-open support on macOS)
		script := fmt.Sprintf(`display notification "%s" with title "%s" sound name "Glass"`,
			message, title)
		cmd := exec.Command("osascript", "-e", script)
		if err := cmd.Run(); err != nil {
			slog.Error("[DeviceTracker] failed to send notification", "error", err)
		}
	}()
}

// cloudCLI describes a cloud provider CLI binary and its purpose.
type cloudCLI struct {
	Name     string `json:"name"`     // Binary name (e.g. "aws")
	Provider string `json:"provider"` // Cloud provider label
	Found    bool   `json:"found"`    // Whether the binary is on PATH
	Path     string `json:"path,omitempty"`
}

// handleCloudCLIStatus detects installed cloud CLIs (aws, gcloud, az, oc)
// so the frontend can show provider-specific IAM auth guidance.
func (s *Server) handleCloudCLIStatus(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	clis := []cloudCLI{
		{Name: "aws", Provider: "AWS EKS"},
		{Name: "gcloud", Provider: "Google GKE"},
		{Name: "az", Provider: "Azure AKS"},
		{Name: "oc", Provider: "OpenShift"},
	}

	for i := range clis {
		if p, err := exec.LookPath(clis[i].Name); err == nil {
			clis[i].Found = true
			clis[i].Path = p
		}
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"clis": clis,
	})
}

// sanitizeClusterError produces a user-facing error message from an internal
// error.  It strips absolute filesystem paths and long stack traces while
// preserving the meaningful part of the message so the UI can show actionable
// guidance instead of a generic "operation failed".
func sanitizeClusterError(err error) string {
	if err == nil {
		return "unknown error"
	}
	msg := err.Error()

	// Cap length so a huge stderr dump doesn't flood the WebSocket payload.
	const maxLen = 512
	if len(msg) > maxLen {
		msg = msg[:maxLen] + "..."
	}

	return msg
}

// handleLocalClusterTools returns detected local cluster tools
func (s *Server) handleLocalClusterTools(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	tools := s.localClusters.DetectTools()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"tools": tools,
	})
}

// handleLocalClusters handles local cluster operations (list, create, delete)
func (s *Server) handleLocalClusters(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case "GET":
		// List all local clusters
		clusters := s.localClusters.ListClusters()
		json.NewEncoder(w).Encode(map[string]interface{}{
			"clusters": clusters,
		})

	case "POST":
		// Create a new cluster
		var req struct {
			Tool string `json:"tool"`
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}
		if req.Tool == "" || req.Name == "" {
			http.Error(w, "tool and name are required", http.StatusBadRequest)
			return
		}

		// SECURITY: Validate cluster name against DNS-1123 to prevent command
		// injection via crafted names that flow into exec.Command args (#7171).
		if err := validateDNS1123Label("cluster name", req.Name); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Create cluster in background and return immediately
		go func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Info("[LocalClusters] recovered from panic creating cluster", "cluster", req.Name, "panic", r)
				}
			}()
			if err := s.localClusters.CreateCluster(req.Tool, req.Name); err != nil {
				slog.Error("[LocalClusters] failed to create cluster", "cluster", req.Name, "tool", req.Tool, "error", err)
				errMsg := sanitizeClusterError(err)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     req.Tool,
					"name":     req.Name,
					"status":   "failed",
					"message":  errMsg,
					"progress": 0,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_error", map[string]string{
					"tool":  req.Tool,
					"name":  req.Name,
					"error": errMsg,
				})
			} else {
				slog.Info("[LocalClusters] created cluster", "cluster", req.Name, "tool", req.Tool)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     req.Tool,
					"name":     req.Name,
					"status":   "done",
					"message":  fmt.Sprintf("Cluster '%s' created successfully", req.Name),
					"progress": 100,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_created", map[string]string{
					"tool": req.Tool,
					"name": req.Name,
				})
				// Kubeconfig watcher will automatically pick up the new cluster
			}
		}()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "creating",
			"tool":    req.Tool,
			"name":    req.Name,
			"message": "Cluster creation started. You will be notified when it completes.",
		})

	case "DELETE":
		// Delete a cluster
		tool := r.URL.Query().Get("tool")
		name := r.URL.Query().Get("name")
		if tool == "" || name == "" {
			http.Error(w, "tool and name query parameters are required", http.StatusBadRequest)
			return
		}

		// SECURITY: Validate cluster name against DNS-1123 (#7171).
		if err := validateDNS1123Label("cluster name", name); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Delete cluster in background
		go func() {
			defer func() {
				if r := recover(); r != nil {
					slog.Info("[LocalClusters] recovered from panic deleting cluster", "cluster", name, "panic", r)
				}
			}()
			if err := s.localClusters.DeleteCluster(tool, name); err != nil {
				slog.Error("[LocalClusters] failed to delete cluster", "cluster", name, "error", err)
				errMsg := sanitizeClusterError(err)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     tool,
					"name":     name,
					"status":   "failed",
					"message":  errMsg,
					"progress": 0,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_error", map[string]string{
					"tool":  tool,
					"name":  name,
					"error": errMsg,
				})
			} else {
				slog.Info("[LocalClusters] deleted cluster", "cluster", name)
				s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
					"tool":     tool,
					"name":     name,
					"status":   "done",
					"message":  fmt.Sprintf("Cluster '%s' deleted successfully", name),
					"progress": 100,
				})
				// Keep backwards-compat event
				s.BroadcastToClients("local_cluster_deleted", map[string]string{
					"tool": tool,
					"name": name,
				})
				// Kubeconfig watcher will automatically pick up the change
			}
		}()

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "deleting",
			"tool":    tool,
			"name":    name,
			"message": "Cluster deletion started. You will be notified when it completes.",
		})

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleLocalClusterLifecycle handles start/stop/restart for local clusters
func (s *Server) handleLocalClusterLifecycle(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Tool   string `json:"tool"`
		Name   string `json:"name"`
		Action string `json:"action"` // "start", "stop", "restart"
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Tool == "" || req.Name == "" || req.Action == "" {
		http.Error(w, "tool, name, and action are required", http.StatusBadRequest)
		return
	}
	// SECURITY: Validate cluster name against DNS-1123 (#7171).
	if err := validateDNS1123Label("cluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.Action != "start" && req.Action != "stop" && req.Action != "restart" {
		http.Error(w, "action must be start, stop, or restart", http.StatusBadRequest)
		return
	}

	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Info("[LocalClusters] recovered from panic during lifecycle action", "action", req.Action, "cluster", req.Name, "panic", r)
			}
		}()

		var err error
		switch req.Action {
		case "start":
			err = s.localClusters.StartCluster(req.Tool, req.Name)
		case "stop":
			err = s.localClusters.StopCluster(req.Tool, req.Name)
		case "restart":
			err = s.localClusters.StopCluster(req.Tool, req.Name)
			if err == nil {
				err = s.localClusters.StartCluster(req.Tool, req.Name)
			}
		}

		if err != nil {
			slog.Error("[LocalClusters] lifecycle action failed", "action", req.Action, "cluster", req.Name, "error", err)
			errMsg := sanitizeClusterError(err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     req.Tool,
				"name":     req.Name,
				"status":   "failed",
				"message":  errMsg,
				"progress": 0,
			})
		} else {
			slog.Info("[LocalClusters] lifecycle action completed", "action", req.Action, "cluster", req.Name)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     req.Tool,
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("Cluster '%s' %sed successfully", req.Name, req.Action),
				"progress": 100,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":  req.Action + "ing",
		"tool":    req.Tool,
		"name":    req.Name,
		"message": fmt.Sprintf("Cluster %s started. You will be notified when it completes.", req.Action),
	})
}

// handleVClusterList returns all vCluster instances
func (s *Server) handleVClusterList(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	instances, err := s.localClusters.ListVClusters()
	if err != nil {
		slog.Error("[vCluster] failed to list vclusters", "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"vclusters": instances,
	})
}

// handleVClusterCreate creates a new vCluster
func (s *Server) handleVClusterCreate(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}

	// SECURITY: Validate name and namespace against DNS-1123 (#7171).
	if err := validateDNS1123Label("vcluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Create vCluster in background and return immediately
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Info("[vCluster] recovered from panic creating vcluster", "name", req.Name, "panic", r)
			}
		}()
		if err := s.localClusters.CreateVCluster(req.Name, req.Namespace); err != nil {
			slog.Error("[vCluster] failed to create vcluster", "name", req.Name, "error", err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "failed",
				"message":  sanitizeClusterError(err),
				"progress": progressFailed,
			})
		} else {
			slog.Info("[vCluster] created vcluster", "name", req.Name, "namespace", req.Namespace)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("vCluster '%s' created successfully", req.Name),
				"progress": progressDone,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "creating",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   "vCluster creation started. You will be notified when it completes.",
	})
}

// handleVClusterConnect connects to an existing vCluster
func (s *Server) handleVClusterConnect(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}
	// SECURITY: Validate name and namespace against DNS-1123 (#7171).
	if err := validateDNS1123Label("vcluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.localClusters.ConnectVCluster(req.Name, req.Namespace); err != nil {
		slog.Error("[vCluster] failed to connect to vcluster", "name", req.Name, "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	slog.Info("[vCluster] connected to vcluster", "name", req.Name, "namespace", req.Namespace)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "connected",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   fmt.Sprintf("Connected to vCluster '%s'", req.Name),
	})
}

// handleVClusterDisconnect disconnects from a vCluster
func (s *Server) handleVClusterDisconnect(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}
	// SECURITY: Validate name and namespace against DNS-1123 (#7171).
	if err := validateDNS1123Label("vcluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if err := s.localClusters.DisconnectVCluster(req.Name, req.Namespace); err != nil {
		slog.Error("[vCluster] failed to disconnect from vcluster", "name", req.Name, "error", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	slog.Info("[vCluster] disconnected from vcluster", "name", req.Name)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "disconnected",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   fmt.Sprintf("Disconnected from vCluster '%s'", req.Name),
	})
}

// handleVClusterDelete deletes a vCluster
func (s *Server) handleVClusterDelete(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Name      string `json:"name"`
		Namespace string `json:"namespace"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if req.Name == "" || req.Namespace == "" {
		http.Error(w, "name and namespace are required", http.StatusBadRequest)
		return
	}
	// SECURITY: Validate name and namespace against DNS-1123 (#7171).
	if err := validateDNS1123Label("vcluster name", req.Name); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateDNS1123Label("namespace", req.Namespace); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Delete vCluster in background and return immediately
	go func() {
		defer func() {
			if r := recover(); r != nil {
				slog.Info("[vCluster] recovered from panic deleting vcluster", "name", req.Name, "panic", r)
			}
		}()
		if err := s.localClusters.DeleteVCluster(req.Name, req.Namespace); err != nil {
			slog.Error("[vCluster] failed to delete vcluster", "name", req.Name, "error", err)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "failed",
				"message":  sanitizeClusterError(err),
				"progress": progressFailed,
			})
		} else {
			slog.Info("[vCluster] deleted vcluster", "name", req.Name, "namespace", req.Namespace)
			s.BroadcastToClients("local_cluster_progress", map[string]interface{}{
				"tool":     "vcluster",
				"name":     req.Name,
				"status":   "done",
				"message":  fmt.Sprintf("vCluster '%s' deleted successfully", req.Name),
				"progress": progressDone,
			})
		}
	}()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "deleting",
		"name":      req.Name,
		"namespace": req.Namespace,
		"message":   "vCluster deletion started. You will be notified when it completes.",
	})
}

// handleInsightsEnrich accepts heuristic insight summaries and returns AI enrichments
func (s *Server) handleInsightsEnrich(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.insightWorker == nil {
		json.NewEncoder(w).Encode(InsightEnrichmentResponse{
			Enrichments: []AIInsightEnrichment{},
			Timestamp:   time.Now().Format(time.RFC3339),
		})
		return
	}

	var req InsightEnrichmentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	resp, err := s.insightWorker.Enrich(req)
	if err != nil {
		slog.Error("[insights] enrichment error", "error", err)
		// Return empty enrichments on error, not HTTP error
		json.NewEncoder(w).Encode(InsightEnrichmentResponse{
			Enrichments: []AIInsightEnrichment{},
			Timestamp:   time.Now().Format(time.RFC3339),
		})
		return
	}

	json.NewEncoder(w).Encode(resp)
}

// handleInsightsAI returns cached AI enrichments
func (s *Server) handleInsightsAI(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	if s.isAllowedOrigin(origin) {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}
	w.Header().Set("Access-Control-Allow-Private-Network", "true")
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if s.insightWorker == nil {
		json.NewEncoder(w).Encode(InsightEnrichmentResponse{
			Enrichments: []AIInsightEnrichment{},
			Timestamp:   time.Now().Format(time.RFC3339),
		})
		return
	}

	json.NewEncoder(w).Encode(s.insightWorker.GetEnrichments())
}

// handleVClusterCheck checks vCluster CRD presence on clusters
func (s *Server) handleVClusterCheck(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Optional: check a specific cluster context via query param
	context := r.URL.Query().Get("context")
	if context != "" {
		status, err := s.localClusters.CheckVClusterOnCluster(context)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(status)
		return
	}

	// Check all clusters
	results, err := s.localClusters.CheckVClusterOnAllClusters()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"clusters": results,
	})
}
