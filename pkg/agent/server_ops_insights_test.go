package agent

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"testing"
)

func TestServer_HandleInsightsEnrich(t *testing.T) {
	registry := &Registry{providers: make(map[string]AIProvider)}
	// No providers registered, so Enrich will fall back to rules
	worker := NewInsightWorker(registry, nil)

	s := &Server{
		insightWorker:  worker,
		allowedOrigins: []string{"*"},
	}

	reqBody := InsightEnrichmentRequest{
		Insights: []InsightSummary{
			{ID: "i1", Category: "event-correlation", Title: "Multiple restarts"},
		},
	}
	body, _ := json.Marshal(reqBody)
	req := httptest.NewRequest("POST", "/insights/enrich", bytes.NewReader(body))
	w := httptest.NewRecorder()

	s.handleInsightsEnrich(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var resp InsightEnrichmentResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if len(resp.Enrichments) != 1 {
		t.Errorf("Expected 1 enrichment, got %d", len(resp.Enrichments))
	}
	if resp.Enrichments[0].Provider != "rules" {
		t.Errorf("Expected rule-based enrichment, got %s", resp.Enrichments[0].Provider)
	}
}

func TestServer_HandleInsightsAI(t *testing.T) {
	worker := NewInsightWorker(&Registry{}, nil)
	s := &Server{
		insightWorker:  worker,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/insights/ai", nil)
	w := httptest.NewRecorder()

	s.handleInsightsAI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected status 200, got %d", w.Code)
	}

	var resp InsightEnrichmentResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	// Initially empty cache
	if len(resp.Enrichments) != 0 {
		t.Errorf("Expected 0 enrichments, got %d", len(resp.Enrichments))
	}
}

func TestServer_HandleVClusterCheck(t *testing.T) {
	// Stub execCommand so CheckVClusterOnAllClusters does not invoke real
	// kubectl binaries. The stub exits 0 with empty output so the handler
	// returns an empty clusters list rather than a 500.
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	s := &Server{
		allowedOrigins: []string{"*"},
		localClusters:  &LocalClusterManager{},
	}

	req := httptest.NewRequest("GET", "/vcluster/check", nil)
	w := httptest.NewRecorder()

	s.handleVClusterCheck(w, req)

	// With stubbed exec and an empty LocalClusterManager the handler returns
	// 200 with an empty clusters list.
	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}
	if _, ok := resp["clusters"]; !ok {
		t.Error("Response should contain 'clusters' field")
	}
}
