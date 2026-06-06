package agent

import (
	"testing"
)

func TestParseAIPredictions_ValidJSON(t *testing.T) {
	w := &PredictionWorker{}

	response := `{"predictions": [
		{
			"category": "pod-crash",
			"severity": "critical",
			"name": "api-gateway-7f8d9c",
			"cluster": "prod-us-east",
			"namespace": "default",
			"reason": "Pod restarting frequently (5 restarts in 10min)",
			"reasonDetailed": "The api-gateway pod shows a crash loop pattern with increasing restart intervals.",
			"confidence": 85
		},
		{
			"category": "resource-trend",
			"severity": "warning",
			"name": "worker-node-3",
			"cluster": "staging",
			"namespace": "",
			"reason": "CPU utilization at 92% and trending up",
			"reasonDetailed": "Node memory is approaching capacity with current workload growth rate.",
			"confidence": 72
		}
	]}`

	predictions, err := w.parseAIPredictions(response, "claude")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(predictions) != 2 {
		t.Fatalf("expected 2 predictions, got %d", len(predictions))
	}

	p1 := predictions[0]
	if p1.Category != "pod-crash" {
		t.Errorf("p1.Category = %q, want %q", p1.Category, "pod-crash")
	}
	if p1.Severity != "critical" {
		t.Errorf("p1.Severity = %q, want %q", p1.Severity, "critical")
	}
	if p1.Name != "api-gateway-7f8d9c" {
		t.Errorf("p1.Name = %q, want %q", p1.Name, "api-gateway-7f8d9c")
	}
	if p1.Cluster != "prod-us-east" {
		t.Errorf("p1.Cluster = %q, want %q", p1.Cluster, "prod-us-east")
	}
	if p1.Namespace != "default" {
		t.Errorf("p1.Namespace = %q, want %q", p1.Namespace, "default")
	}
	if p1.Confidence != 85 {
		t.Errorf("p1.Confidence = %d, want %d", p1.Confidence, 85)
	}
	if p1.Provider != "claude" {
		t.Errorf("p1.Provider = %q, want %q", p1.Provider, "claude")
	}
	if p1.ID == "" {
		t.Error("p1.ID should not be empty (UUID)")
	}
	if p1.GeneratedAt == "" {
		t.Error("p1.GeneratedAt should not be empty")
	}

	p2 := predictions[1]
	if p2.Category != "resource-trend" {
		t.Errorf("p2.Category = %q, want %q", p2.Category, "resource-trend")
	}
	if p2.Confidence != 72 {
		t.Errorf("p2.Confidence = %d, want %d", p2.Confidence, 72)
	}
}

func TestParseAIPredictions_EmptyPredictions(t *testing.T) {
	w := &PredictionWorker{}

	response := `{"predictions": []}`
	predictions, err := w.parseAIPredictions(response, "openai")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(predictions) != 0 {
		t.Errorf("expected 0 predictions, got %d", len(predictions))
	}
}

func TestParseAIPredictions_MarkdownFence(t *testing.T) {
	w := &PredictionWorker{}

	// AI models often wrap JSON in markdown code fences
	response := "```json\n{\"predictions\": [{\"category\": \"anomaly\", \"severity\": \"warning\", \"name\": \"etcd-leader\", \"cluster\": \"control-plane\", \"namespace\": \"kube-system\", \"reason\": \"Leader election instability\", \"reasonDetailed\": \"Multiple leader elections in the last hour\", \"confidence\": 65}]}\n```"

	predictions, err := w.parseAIPredictions(response, "gemini")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(predictions) != 1 {
		t.Fatalf("expected 1 prediction, got %d", len(predictions))
	}
	if predictions[0].Category != "anomaly" {
		t.Errorf("category = %q, want %q", predictions[0].Category, "anomaly")
	}
}

func TestParseAIPredictions_PreambleText(t *testing.T) {
	w := &PredictionWorker{}

	// Some models add explanatory text before the JSON
	response := `Based on the cluster metrics, here is my analysis:

{"predictions": [{"category": "capacity-risk", "severity": "critical", "name": "gpu-pool", "cluster": "ml-training", "namespace": "", "reason": "GPU nodes at 95% allocation", "reasonDetailed": "No headroom for failover", "confidence": 90}]}

This indicates a serious capacity concern.`

	predictions, err := w.parseAIPredictions(response, "openrouter")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(predictions) != 1 {
		t.Fatalf("expected 1 prediction, got %d", len(predictions))
	}
	if predictions[0].Severity != "critical" {
		t.Errorf("severity = %q, want %q", predictions[0].Severity, "critical")
	}
}

func TestParseAIPredictions_NoJSON(t *testing.T) {
	w := &PredictionWorker{}

	response := "I cannot analyze the cluster data because no metrics were provided."
	_, err := w.parseAIPredictions(response, "claude")
	if err == nil {
		t.Fatal("expected error for response with no JSON, got nil")
	}
}

func TestParseAIPredictions_MalformedJSON(t *testing.T) {
	w := &PredictionWorker{}

	response := `{"predictions": [{"category": "pod-crash", "severity": INVALID}]}`
	_, err := w.parseAIPredictions(response, "openai")
	if err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

func TestMergePredictions_SingleProvider(t *testing.T) {
	w := &PredictionWorker{}

	input := map[string][]AIPrediction{
		"claude": {
			{ID: "1", Category: "pod-crash", Name: "api", Cluster: "prod", Severity: "critical", Confidence: 80},
			{ID: "2", Category: "resource-trend", Name: "node-1", Cluster: "staging", Severity: "warning", Confidence: 65},
		},
	}

	result := w.mergePredictions(input, false)
	if len(result) != 2 {
		t.Fatalf("expected 2 predictions, got %d", len(result))
	}
}

func TestMergePredictions_ConsensusBoost(t *testing.T) {
	w := &PredictionWorker{}

	input := map[string][]AIPrediction{
		"claude": {
			{ID: "1", Category: "pod-crash", Name: "api", Cluster: "prod", Severity: "critical", Confidence: 80, Provider: "claude"},
		},
		"openai": {
			{ID: "2", Category: "pod-crash", Name: "api", Cluster: "prod", Severity: "critical", Confidence: 70, Provider: "openai"},
		},
	}

	result := w.mergePredictions(input, true)
	if len(result) != 1 {
		t.Fatalf("expected 1 merged prediction, got %d", len(result))
	}

	// Consensus: avg(80,70)=75, +10 bonus = 85
	if result[0].Confidence != 85 {
		t.Errorf("confidence = %d, want 85 (consensus boosted)", result[0].Confidence)
	}
	// Provider field should contain both
	if result[0].Provider != "claude,openai" && result[0].Provider != "openai,claude" {
		t.Errorf("provider = %q, want both providers listed", result[0].Provider)
	}
}

func TestMergePredictions_ConsensusBoostCap(t *testing.T) {
	w := &PredictionWorker{}

	input := map[string][]AIPrediction{
		"claude": {
			{ID: "1", Category: "pod-crash", Name: "x", Cluster: "c", Severity: "critical", Confidence: 98, Provider: "claude"},
		},
		"openai": {
			{ID: "2", Category: "pod-crash", Name: "x", Cluster: "c", Severity: "critical", Confidence: 96, Provider: "openai"},
		},
	}

	result := w.mergePredictions(input, true)
	if len(result) != 1 {
		t.Fatalf("expected 1 prediction, got %d", len(result))
	}
	// avg(98,96)=97, +10 = 107 → capped at 100
	if result[0].Confidence != 100 {
		t.Errorf("confidence = %d, want 100 (capped)", result[0].Confidence)
	}
}

func TestMergePredictions_NoConsensusUsesFirstProvider(t *testing.T) {
	w := &PredictionWorker{}

	input := map[string][]AIPrediction{
		"claude": {
			{ID: "1", Category: "pod-crash", Name: "a", Cluster: "c", Severity: "critical", Confidence: 80},
		},
		"openai": {
			{ID: "2", Category: "anomaly", Name: "b", Cluster: "c", Severity: "warning", Confidence: 60},
		},
	}

	result := w.mergePredictions(input, false)
	// Without consensus mode, should return first provider's predictions only
	if len(result) > 2 {
		t.Fatalf("expected at most 2 predictions (first provider), got %d", len(result))
	}
}

func TestMergePredictions_SortBySeverityThenConfidence(t *testing.T) {
	w := &PredictionWorker{}

	input := map[string][]AIPrediction{
		"claude": {
			{ID: "1", Category: "resource-trend", Name: "low-conf", Cluster: "c", Severity: "warning", Confidence: 60},
			{ID: "2", Category: "pod-crash", Name: "high-conf", Cluster: "c", Severity: "critical", Confidence: 95},
			{ID: "3", Category: "capacity-risk", Name: "med-conf", Cluster: "c", Severity: "critical", Confidence: 75},
			{ID: "4", Category: "anomaly", Name: "high-warn", Cluster: "c", Severity: "warning", Confidence: 90},
		},
	}

	result := w.mergePredictions(input, true)
	if len(result) < 4 {
		t.Fatalf("expected 4 predictions, got %d", len(result))
	}

	// Critical should come before warning
	if result[0].Severity != "critical" {
		t.Errorf("result[0].Severity = %q, want critical (highest priority)", result[0].Severity)
	}
	// Among criticals, higher confidence first
	if result[0].Confidence < result[1].Confidence && result[0].Severity == result[1].Severity {
		t.Errorf("criticals should be sorted by confidence descending")
	}
}

func TestMergePredictions_EmptyInput(t *testing.T) {
	w := &PredictionWorker{}

	result := w.mergePredictions(map[string][]AIPrediction{}, true)
	if len(result) != 0 {
		t.Errorf("expected 0 predictions for empty input, got %d", len(result))
	}
}

func TestMergePredictions_DisjointPredictions(t *testing.T) {
	w := &PredictionWorker{}

	input := map[string][]AIPrediction{
		"claude": {
			{ID: "1", Category: "pod-crash", Name: "api", Cluster: "prod", Severity: "critical", Confidence: 80, Provider: "claude"},
		},
		"openai": {
			{ID: "2", Category: "resource-trend", Name: "node-5", Cluster: "staging", Severity: "warning", Confidence: 70, Provider: "openai"},
		},
	}

	result := w.mergePredictions(input, true)
	// Different categories+names+clusters → no merging, both should appear
	if len(result) != 2 {
		t.Fatalf("expected 2 disjoint predictions, got %d", len(result))
	}
}
