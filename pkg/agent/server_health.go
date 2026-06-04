package agent

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"runtime"
	"time"

	"github.com/kubestellar/console/pkg/agent/protocol"
)

// handleHealth handles HTTP health checks
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Health endpoint stays unauthenticated for discovery, so keep the response
	// minimal and avoid leaking operational telemetry.
	writeJSON(w, map[string]string{
		"status":  "ok",
		"version": Version,
	})
}

func (s *Server) buildStatusPayload() protocol.HealthPayload {
	clusterCount := 0
	if s.kubectl != nil {
		clusters, _ := s.kubectl.ListContexts()
		clusterCount = len(clusters)
	}
	registry := s.registry
	if registry == nil {
		registry = &Registry{providers: make(map[string]AIProvider)}
	}
	providerSummaries := make([]protocol.ProviderSummary, 0)
	for _, p := range registry.ListAvailable() {
		providerSummaries = append(providerSummaries, protocol.ProviderSummary{
			Name:         p.Name,
			DisplayName:  p.DisplayName,
			Capabilities: p.Capabilities,
		})
	}

	hasClaude := s.checkClaudeAvailable()

	return protocol.HealthPayload{
		Status:             "ok",
		Version:            Version,
		CommitSHA:          CommitSHA,
		BuildTime:          BuildTime,
		GoVersion:          runtime.Version(),
		OS:                 runtime.GOOS,
		Arch:               runtime.GOARCH,
		Clusters:           clusterCount,
		HasClaude:          hasClaude,
		Claude:             s.getClaudeInfo(),
		InstallMethod:      detectAgentInstallMethod(),
		AvailableProviders: providerSummaries,
	}
}

// handleStatus handles authenticated agent status probes.
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	writeJSON(w, s.buildStatusPayload())
}

func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	GetMetricsHandler().ServeHTTP(w, r)
}

// handleProviderCheck runs a readiness handshake for a specific provider.
// GET /provider/check?name=antigravity
func (s *Server) handleProviderCheck(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	providerName := r.URL.Query().Get("name")
	if providerName == "" {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(w, protocol.ErrorPayload{
			Code:    "missing_name",
			Message: "Query parameter 'name' is required",
		})
		return
	}

	provider, err := s.registry.Get(providerName)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		writeJSON(w, protocol.ProviderCheckResponse{
			Provider: providerName,
			Ready:    false,
			State:    "failed",
			Message:  fmt.Sprintf("Provider '%s' is not registered", providerName),
		})
		return
	}

	// Check if the provider supports explicit handshake
	hp, hasHandshake := provider.(HandshakeProvider)
	if !hasHandshake {
		// Providers without Handshake just report availability
		resp := protocol.ProviderCheckResponse{
			Provider:     providerName,
			Ready:        provider.IsAvailable(),
			HasHandshake: false,
		}
		if provider.IsAvailable() {
			resp.State = "connected"
			resp.Message = fmt.Sprintf("%s is available", provider.DisplayName())
		} else {
			resp.State = "failed"
			resp.Message = fmt.Sprintf("%s is not available", provider.DisplayName())
		}
		writeJSON(w, resp)
		return
	}

	// Run the handshake with a timeout
	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	result := hp.Handshake(ctx)
	slog.Info("[ProviderCheck] result", "provider", providerName, "state", result.State, "ready", result.Ready, "message", result.Message)

	writeJSON(w, protocol.ProviderCheckResponse{
		Provider:      providerName,
		Ready:         result.Ready,
		State:         result.State,
		Message:       result.Message,
		Prerequisites: result.Prerequisites,
		Version:       result.Version,
		CliPath:       result.CliPath,
		HasHandshake:  true,
	})
}
