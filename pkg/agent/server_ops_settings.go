package agent

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/settings"
)

func (s *Server) handleSettingsKeys(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.handleGetKeysStatus(w, r)
	case http.MethodPost:
		s.handleSetKey(w, r)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "GET or POST required"})
	}
}

func (s *Server) handleSettingsKeyByProvider(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodDelete, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "DELETE required"})
		return
	}

	provider := strings.TrimPrefix(r.URL.Path, "/settings/keys/")
	if provider == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "missing_provider", Message: "Provider name required"})
		return
	}

	cm := GetConfigManager()
	if cm.IsFromEnv(provider) {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{
			Code:    "env_key",
			Message: "Cannot delete API key set via environment variable. Unset the environment variable instead.",
		})
		return
	}
	if err := cm.RemoveAPIKey(provider); err != nil {
		slog.Error("delete API key error", "error", err)
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, protocol.ErrorPayload{Code: "delete_failed", Message: "failed to delete API key"})
		return
	}

	cm.InvalidateKeyValidity(provider)
	s.refreshProviderAvailability()
	slog.Info("API key removed", "provider", provider)
	writeJSON(w, map[string]bool{"success": true})
}

func (s *Server) handleSettingsAll(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodGet, http.MethodPut, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sm := settings.GetSettingsManager()
	switch r.Method {
	case http.MethodGet:
		all, err := sm.GetAll()
		if err != nil {
			slog.Error("[settings] GetAll error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, protocol.ErrorPayload{Code: "settings_load_failed", Message: "Failed to load settings"})
			return
		}
		writeJSON(w, all)
	case http.MethodPut:
		defer r.Body.Close()
		body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBodyBytes))
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, protocol.ErrorPayload{Code: "read_error", Message: "Failed to read request body"})
			return
		}

		var all settings.AllSettings
		if err := json.Unmarshal(body, &all); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, protocol.ErrorPayload{Code: "invalid_body", Message: "Invalid request body"})
			return
		}
		if err := sm.SaveAll(&all); err != nil {
			slog.Error("[settings] SaveAll error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, protocol.ErrorPayload{Code: "settings_save_failed", Message: "Failed to save settings"})
			return
		}

		writeJSON(w, map[string]any{"success": true, "message": "Settings saved"})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "GET or PUT required"})
	}
}

func (s *Server) handleSettingsExport(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPost {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "POST required"})
		return
	}

	sm := settings.GetSettingsManager()
	data, err := sm.ExportEncrypted()
	if err != nil {
		slog.Error("[settings] export error", "error", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		writeJSON(w, protocol.ErrorPayload{Code: "export_failed", Message: "Failed to export settings"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=kc-settings-backup.json")
	w.Write(data)
}

func (s *Server) handleSettingsImport(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPut, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodPut && r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		writeJSON(w, protocol.ErrorPayload{Code: "method_not_allowed", Message: "PUT or POST required"})
		return
	}

	defer r.Body.Close()
	body, err := io.ReadAll(io.LimitReader(r.Body, maxRequestBodyBytes))
	if err != nil || len(body) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "empty_body", Message: "Empty request body"})
		return
	}

	sm := settings.GetSettingsManager()
	if err := sm.ImportEncrypted(body); err != nil {
		slog.Error("[settings] import error", "error", err)
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "import_failed", Message: "failed to import settings"})
		return
	}

	writeJSON(w, map[string]any{"success": true, "message": "Settings imported"})
}

type providerDef struct {
	name               string
	displayName        string
	validationRequired bool
	isLocalLLM         bool
	defaultURL         string
}

var settingsProviders = []providerDef{
	{name: "groq", displayName: "Groq", validationRequired: true},
	{name: "openrouter", displayName: "OpenRouter", validationRequired: true},
	{name: "open-webui", displayName: "Open WebUI"},
	{name: ProviderKeyOllama, displayName: "Ollama (Local)", isLocalLLM: true, defaultURL: defaultOllamaURL},
	{name: ProviderKeyLlamaCpp, displayName: "llama.cpp (Local)", isLocalLLM: true},
	{name: ProviderKeyLocalAI, displayName: "LocalAI (Local)", isLocalLLM: true},
	{name: ProviderKeyVLLM, displayName: "vLLM (Local)", isLocalLLM: true},
	{name: ProviderKeyLMStudio, displayName: "LM Studio (Local)", isLocalLLM: true, defaultURL: defaultLMStudioURL},
	{name: ProviderKeyRHAIIS, displayName: "Red Hat AI Inference Server", isLocalLLM: true},
}

func (s *Server) handleGetKeysStatus(w http.ResponseWriter, r *http.Request) {
	cm := GetConfigManager()
	keys := make([]KeyStatus, 0, len(settingsProviders))

	for _, p := range settingsProviders {
		status := KeyStatus{Provider: p.name, DisplayName: p.displayName, Configured: cm.HasAPIKey(p.name)}
		status.BaseURL = cm.GetBaseURL(p.name)
		status.BaseURLEnvVar = getBaseURLEnvKeyForProvider(p.name)
		if status.BaseURLEnvVar != "" && os.Getenv(status.BaseURLEnvVar) != "" {
			status.BaseURLSource = "env"
		} else if status.BaseURL != "" {
			status.BaseURLSource = "config"
		}
		if p.isLocalLLM && status.BaseURL == "" && p.defaultURL != "" {
			status.BaseURL = p.defaultURL
		}
		if p.isLocalLLM {
			status.Configured = status.BaseURLSource != ""
		}

		if status.Configured {
			if cm.IsFromEnv(p.name) {
				status.Source = "env"
			} else {
				status.Source = "config"
			}
			if p.validationRequired {
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

	registry := s.registry
	if registry == nil {
		registry = GetRegistry()
	}
	writeJSON(w, KeysStatusResponse{
		Keys:                keys,
		ConfigPath:          cm.GetConfigPath(),
		RegisteredProviders: registry.List(),
	})
}

func (s *Server) handleSetKey(w http.ResponseWriter, r *http.Request) {
	var req SetKeyRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, maxRequestBodyBytes)).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "invalid_json", Message: "Invalid JSON body"})
		return
	}
	if req.Provider == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "missing_provider", Message: "Provider name required"})
		return
	}

	registry := s.registry
	if registry == nil {
		registry = GetRegistry()
	}
	if _, err := registry.Get(req.Provider); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "unknown_provider", Message: "Provider is not registered"})
		return
	}
	if req.APIKey == "" && req.BaseURL == "" && req.Model == "" && !req.ClearBaseURL {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{Code: "missing_field", Message: "At least one of apiKey, baseURL, model, or clearBaseURL is required"})
		return
	}

	cm := GetConfigManager()
	if req.BaseURL != "" {
		if err := validateBaseURL(req.BaseURL); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			writeJSON(w, protocol.ErrorPayload{Code: "invalid_base_url", Message: err.Error()})
			return
		}
		if err := cm.SetBaseURL(req.Provider, req.BaseURL); err != nil {
			slog.Error("save base URL error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, protocol.ErrorPayload{Code: "save_failed", Message: "failed to save base URL"})
			return
		}
		cm.InvalidateKeyValidity(req.Provider)
	} else if req.ClearBaseURL {
		if err := cm.RemoveBaseURL(req.Provider); err != nil {
			slog.Error("clear base URL error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, protocol.ErrorPayload{Code: "save_failed", Message: "failed to clear base URL"})
			return
		}
		cm.InvalidateKeyValidity(req.Provider)
	}

	if req.APIKey != "" {
		valid, validationErr := s.validateAPIKeyValue(req.Provider, req.APIKey)
		if !valid {
			w.WriteHeader(http.StatusBadRequest)
			if validationErr != nil {
				slog.Error("API key validation error", "error", validationErr)
			}
			writeJSON(w, protocol.ErrorPayload{Code: "invalid_key", Message: "Invalid API key"})
			return
		}
		if err := cm.SetAPIKey(req.Provider, req.APIKey); err != nil {
			slog.Error("save API key error", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, protocol.ErrorPayload{Code: "save_failed", Message: "failed to save API key"})
			return
		}
		cm.SetKeyValidity(req.Provider, true)
	}

	if req.Model != "" {
		if err := cm.SetModel(req.Provider, req.Model); err != nil {
			slog.Error("failed to save model preference", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			writeJSON(w, protocol.ErrorPayload{Code: "save_failed", Message: "failed to save model preference"})
			return
		}
	}

	s.refreshProviderAvailability()
	slog.Info("provider configured", "provider", req.Provider, "hasKey", req.APIKey != "", "hasBaseURL", req.BaseURL != "", "hasModel", req.Model != "")
	writeJSON(w, map[string]any{"success": true, "provider": req.Provider})
}

func (s *Server) refreshProviderAvailability() {}
