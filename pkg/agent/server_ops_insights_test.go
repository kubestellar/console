package agent

import (
	"github.com/kubestellar/console/pkg/agent/kube"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
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
	req.Host = "localhost"
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
	req.Host = "localhost"
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
	// #22615 — The prior test tried to stub `pkg/agent.execCommand`, but
	// CheckVClusterOnAllClusters lives in the `pkg/agent/kube` package and
	// uses its own unexported `execCommand`, so the stub was never in
	// effect and the handler tried to exec real kubectl. Instead, install
	// a fake `kubectl` on PATH that exits 0 with empty output so the
	// handler returns an empty cluster list without needing a real cluster.
	fakePath := t.TempDir()
	kubectlScript := filepath.Join(fakePath, "kubectl")
	if err := os.WriteFile(kubectlScript, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("failed to write fake kubectl: %v", err)
	}
	origPath := os.Getenv("PATH")
	t.Setenv("PATH", fakePath+string(os.PathListSeparator)+origPath)

	// Preserve the old stub-swap in case any other agent-package helper
	// uses it — harmless when unused.
	oldExecCommand := execCommand
	defer func() { execCommand = oldExecCommand }()
	execCommand = func(name string, args ...string) *exec.Cmd {
		return exec.Command("true")
	}

	s := &Server{
		allowedOrigins: []string{"*"},
		localClusters:  &kube.LocalClusterManager{},
	}

	req := httptest.NewRequest("GET", "/vcluster/check", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	s.handleVClusterCheck(w, req)

	// With a fake kubectl exiting 0 and an empty LocalClusterManager the
	// handler returns 200 with an empty clusters list.
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
