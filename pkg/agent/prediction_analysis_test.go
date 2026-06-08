package agent

import (
	"testing"
)

func TestParseAIPredictions(t *testing.T) {
	w := &PredictionWorker{}

	tests := []struct {
		name         string
		response     string
		provider     string
		wantCount    int
		wantErr      bool
		wantErrMsg   string
		checkFirst   func(t *testing.T, p AIPrediction)
	}{
		{
			name: "valid JSON with single prediction",
			response: `{"predictions":[{"category":"pod-crash","severity":"critical","name":"nginx-pod","cluster":"prod","namespace":"default","reason":"OOMKilled","reasonDetailed":"Pod exceeded memory limit","confidence":85}]}`,
			provider:  "openai",
			wantCount: 1,
			checkFirst: func(t *testing.T, p AIPrediction) {
				if p.Category != "pod-crash" {
					t.Errorf("Category = %q, want %q", p.Category, "pod-crash")
				}
				if p.Severity != "critical" {
					t.Errorf("Severity = %q, want %q", p.Severity, "critical")
				}
				if p.Name != "nginx-pod" {
					t.Errorf("Name = %q, want %q", p.Name, "nginx-pod")
				}
				if p.Cluster != "prod" {
					t.Errorf("Cluster = %q, want %q", p.Cluster, "prod")
				}
				if p.Confidence != 85 {
					t.Errorf("Confidence = %d, want %d", p.Confidence, 85)
				}
				if p.Provider != "openai" {
					t.Errorf("Provider = %q, want %q", p.Provider, "openai")
				}
			},
		},
		{
			name: "JSON with markdown fence prefix",
			response: "Here is the analysis:\n```json\n" + `{"predictions":[{"category":"anomaly","severity":"warning","name":"api-server","cluster":"dev","reason":"latency spike","reasonDetailed":"P99 latency increased 3x","confidence":72}]}` + "\n```\nHope this helps!",
			provider:  "anthropic",
			wantCount: 1,
			checkFirst: func(t *testing.T, p AIPrediction) {
				if p.Category != "anomaly" {
					t.Errorf("Category = %q, want %q", p.Category, "anomaly")
				}
				if p.Provider != "anthropic" {
					t.Errorf("Provider = %q, want %q", p.Provider, "anthropic")
				}
			},
		},
		{
			name: "multiple predictions",
			response: `{"predictions":[
				{"category":"pod-crash","severity":"critical","name":"redis","cluster":"prod","reason":"CrashLoopBackOff","reasonDetailed":"Container failing health checks","confidence":90},
				{"category":"capacity-risk","severity":"warning","name":"node-pool-1","cluster":"staging","reason":"CPU pressure","reasonDetailed":"Nodes at 95% CPU","confidence":65},
				{"category":"resource-trend","severity":"warning","name":"pvc-data","cluster":"prod","namespace":"storage","reason":"disk filling","reasonDetailed":"PVC at 87% and growing","confidence":78}
			]}`,
			provider:  "gemini",
			wantCount: 3,
		},
		{
			name:       "no JSON in response",
			response:   "I cannot analyze the cluster data without more context.",
			provider:   "openai",
			wantCount:  0,
			wantErr:    true,
			wantErrMsg: "no JSON object found",
		},
		{
			name:       "malformed JSON",
			response:   `{"predictions": [{"category": "broken"`,
			provider:   "openai",
			wantCount:  0,
			wantErr:    true,
			wantErrMsg: "failed to parse AI response",
		},
		{
			name:      "empty predictions array",
			response:  `{"predictions":[]}`,
			provider:  "openai",
			wantCount: 0,
			wantErr:   false,
		},
		{
			name:      "extra fields ignored",
			response:  `{"predictions":[{"category":"anomaly","severity":"warning","name":"test","cluster":"c1","reason":"r","reasonDetailed":"rd","confidence":50,"unknownField":"ignored"}],"metadata":"also ignored"}`,
			provider:  "test",
			wantCount: 1,
		},
		{
			name:      "preamble text before JSON",
			response:  "Based on my analysis of the cluster metrics, here are my predictions:\n\n" + `{"predictions":[{"category":"pod-crash","severity":"critical","name":"worker","cluster":"prod","reason":"evicted","reasonDetailed":"node pressure","confidence":88}]}`,
			provider:  "openai",
			wantCount: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			predictions, err := w.parseAIPredictions(tt.response, tt.provider)
			if tt.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if tt.wantErrMsg != "" && !containsSubstring(err.Error(), tt.wantErrMsg) {
					t.Errorf("error = %q, want substring %q", err.Error(), tt.wantErrMsg)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(predictions) != tt.wantCount {
				t.Fatalf("got %d predictions, want %d", len(predictions), tt.wantCount)
			}
			if tt.checkFirst != nil && len(predictions) > 0 {
				tt.checkFirst(t, predictions[0])
			}
			// Verify all predictions have IDs and timestamps
			for i, p := range predictions {
				if p.ID == "" {
					t.Errorf("prediction[%d].ID is empty", i)
				}
				if p.GeneratedAt == "" {
					t.Errorf("prediction[%d].GeneratedAt is empty", i)
				}
			}
		})
	}
}

func TestMergePredictions(t *testing.T) {
	w := &PredictionWorker{}

	t.Run("consensus mode off returns first provider", func(t *testing.T) {
		byProvider := map[string][]AIPrediction{
			"openai": {
				{Category: "pod-crash", Severity: "critical", Name: "nginx", Cluster: "prod", Confidence: 80},
			},
			"anthropic": {
				{Category: "anomaly", Severity: "warning", Name: "api", Cluster: "dev", Confidence: 70},
			},
		}
		result := w.mergePredictions(byProvider, false)
		// Should return one provider's predictions (map iteration order is non-deterministic)
		if len(result) != 1 {
			t.Fatalf("got %d predictions, want 1", len(result))
		}
	})

	t.Run("single provider passes through", func(t *testing.T) {
		byProvider := map[string][]AIPrediction{
			"openai": {
				{Category: "pod-crash", Severity: "critical", Name: "nginx", Cluster: "prod", Confidence: 80},
				{Category: "anomaly", Severity: "warning", Name: "api", Cluster: "dev", Confidence: 60},
			},
		}
		result := w.mergePredictions(byProvider, true)
		if len(result) != 2 {
			t.Fatalf("got %d predictions, want 2", len(result))
		}
	})

	t.Run("consensus boosts confidence", func(t *testing.T) {
		byProvider := map[string][]AIPrediction{
			"openai": {
				{Category: "pod-crash", Severity: "critical", Name: "nginx", Cluster: "prod", Confidence: 80},
			},
			"anthropic": {
				{Category: "pod-crash", Severity: "critical", Name: "nginx", Cluster: "prod", Confidence: 90},
			},
		}
		result := w.mergePredictions(byProvider, true)
		if len(result) != 1 {
			t.Fatalf("got %d predictions, want 1", len(result))
		}
		// Average of 80+90=85, plus consensus bonus of 10 = 95
		if result[0].Confidence != 95 {
			t.Errorf("Confidence = %d, want 95 (avg 85 + 10 bonus)", result[0].Confidence)
		}
	})

	t.Run("consensus confidence capped at 100", func(t *testing.T) {
		byProvider := map[string][]AIPrediction{
			"openai": {
				{Category: "pod-crash", Severity: "critical", Name: "nginx", Cluster: "prod", Confidence: 95},
			},
			"anthropic": {
				{Category: "pod-crash", Severity: "critical", Name: "nginx", Cluster: "prod", Confidence: 99},
			},
		}
		result := w.mergePredictions(byProvider, true)
		if len(result) != 1 {
			t.Fatalf("got %d predictions, want 1", len(result))
		}
		// Average of 95+99=97, plus 10 = 107, capped at 100
		if result[0].Confidence != 100 {
			t.Errorf("Confidence = %d, want 100 (capped)", result[0].Confidence)
		}
	})

	t.Run("consensus merges provider names", func(t *testing.T) {
		byProvider := map[string][]AIPrediction{
			"openai": {
				{Category: "anomaly", Severity: "warning", Name: "svc", Cluster: "dev", Confidence: 70, Provider: "openai"},
			},
			"anthropic": {
				{Category: "anomaly", Severity: "warning", Name: "svc", Cluster: "dev", Confidence: 75, Provider: "anthropic"},
			},
		}
		result := w.mergePredictions(byProvider, true)
		if len(result) != 1 {
			t.Fatalf("got %d predictions, want 1", len(result))
		}
		// Provider should contain both names
		if !containsSubstring(result[0].Provider, "openai") || !containsSubstring(result[0].Provider, "anthropic") {
			t.Errorf("Provider = %q, want both openai and anthropic", result[0].Provider)
		}
	})

	t.Run("sorts critical before warning", func(t *testing.T) {
		byProvider := map[string][]AIPrediction{
			"openai": {
				{Category: "anomaly", Severity: "warning", Name: "svc", Cluster: "dev", Confidence: 95},
				{Category: "pod-crash", Severity: "critical", Name: "api", Cluster: "prod", Confidence: 60},
			},
		}
		result := w.mergePredictions(byProvider, true)
		if len(result) != 2 {
			t.Fatalf("got %d predictions, want 2", len(result))
		}
		if result[0].Severity != "critical" {
			t.Errorf("result[0].Severity = %q, want %q (critical should sort first)", result[0].Severity, "critical")
		}
	})

	t.Run("same severity sorted by confidence descending", func(t *testing.T) {
		byProvider := map[string][]AIPrediction{
			"openai": {
				{Category: "anomaly", Severity: "warning", Name: "svc-a", Cluster: "dev", Confidence: 60},
				{Category: "resource-trend", Severity: "warning", Name: "svc-b", Cluster: "dev", Confidence: 90},
			},
		}
		result := w.mergePredictions(byProvider, true)
		if len(result) != 2 {
			t.Fatalf("got %d predictions, want 2", len(result))
		}
		if result[0].Confidence < result[1].Confidence {
			t.Errorf("expected higher confidence first: got %d then %d", result[0].Confidence, result[1].Confidence)
		}
	})

	t.Run("empty provider map returns empty slice", func(t *testing.T) {
		result := w.mergePredictions(map[string][]AIPrediction{}, true)
		if len(result) != 0 {
			t.Fatalf("got %d predictions, want 0", len(result))
		}
	})
}


func stringContains(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
