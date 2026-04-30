package agent

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

// handleInsightsEnrich accepts heuristic insight summaries and returns AI enrichments
func (s *Server) handleInsightsEnrich(w http.ResponseWriter, r *http.Request) {
	s.setCORSHeaders(w, r, http.MethodPost, http.MethodOptions)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// SECURITY: require auth before triggering AI enrichment (#7231).
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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
	s.setCORSHeaders(w, r)
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	if r.Method != "GET" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// SECURITY: require auth before returning cached AI enrichments (#7233).
	if !s.validateToken(r) {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
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
		w.WriteHeader(http.StatusNoContent)
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
