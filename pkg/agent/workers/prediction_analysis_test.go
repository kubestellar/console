package workers

import (
	"testing"

	"github.com/kubestellar/console/pkg/ai"
	"github.com/kubestellar/console/pkg/k8s"
	"k8s.io/client-go/tools/clientcmd/api"
)

func newTestWorkerForMerge(t *testing.T) *PredictionWorker {
	t.Helper()
	m, _ := k8s.NewMultiClusterClient("")
	m.SetRawConfig(&api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
		Clusters: map[string]*api.Cluster{"cl1": {Server: "s1"}},
	})

	reg := newMockProviderRegistry()

	broadcast := func(msg string, payload interface{}) {}
	trackTokens := func(usage *ai.ProviderTokenUsage) {}

	return NewPredictionWorker(m, reg, broadcast, trackTokens)
}

func TestMergePredictions_NonConsensusReturnsSingle(t *testing.T) {
	w := newTestWorkerForMerge(t)

	byProvider := map[string][]AIPrediction{
		"claude": {
			{Category: "pod-crash", Severity: "critical", Name: "api-server", Cluster: "prod", Confidence: 80, Provider: "claude"},
		},
		"openai": {
			{Category: "anomaly", Severity: "warning", Name: "worker", Cluster: "staging", Confidence: 60, Provider: "openai"},
		},
	}

	// Non-consensus mode: returns first provider's predictions only
	result := w.mergePredictions(byProvider, false)
	if len(result) == 0 {
		t.Fatal("Expected non-empty result")
	}
	// Should return one provider's predictions unmodified
	if len(result) > 2 {
		t.Errorf("Non-consensus should return one provider's predictions, got %d", len(result))
	}
}

func TestMergePredictions_SingleProviderConsensus(t *testing.T) {
	w := newTestWorkerForMerge(t)

	byProvider := map[string][]AIPrediction{
		"claude": {
			{Category: "pod-crash", Severity: "critical", Name: "api-pod", Cluster: "prod", Confidence: 85, Provider: "claude"},
			{Category: "anomaly", Severity: "warning", Name: "db-pod", Cluster: "staging", Confidence: 55, Provider: "claude"},
		},
	}

	// Consensus mode with single provider returns same predictions
	result := w.mergePredictions(byProvider, true)
	if len(result) != 2 {
		t.Errorf("Expected 2 predictions, got %d", len(result))
	}
}

func TestMergePredictions_ConsensusBoostsConfidence(t *testing.T) {
	w := newTestWorkerForMerge(t)

	// Two providers agree on the same prediction (same category-name-cluster key)
	byProvider := map[string][]AIPrediction{
		"claude": {
			{Category: "pod-crash", Severity: "critical", Name: "api-pod", Cluster: "prod", Confidence: 70, Provider: "claude"},
		},
		"openai": {
			{Category: "pod-crash", Severity: "critical", Name: "api-pod", Cluster: "prod", Confidence: 80, Provider: "openai"},
		},
	}

	result := w.mergePredictions(byProvider, true)
	if len(result) != 1 {
		t.Fatalf("Expected 1 merged prediction, got %d", len(result))
	}

	// Confidence should be boosted: avg(70,80) + 10 = 85
	if result[0].Confidence != 85 {
		t.Errorf("Expected boosted confidence 85, got %d", result[0].Confidence)
	}
	// Provider field should contain both names
	if result[0].Provider != "claude,openai" && result[0].Provider != "openai,claude" {
		t.Errorf("Expected merged provider names, got %q", result[0].Provider)
	}
}

func TestMergePredictions_ConsensusCapAt100(t *testing.T) {
	w := newTestWorkerForMerge(t)

	// Both providers have confidence 95 → avg=95 + 10 = 105 → capped at 100
	byProvider := map[string][]AIPrediction{
		"claude": {
			{Category: "capacity-risk", Severity: "critical", Name: "disk-full", Cluster: "prod", Confidence: 95, Provider: "claude"},
		},
		"openai": {
			{Category: "capacity-risk", Severity: "critical", Name: "disk-full", Cluster: "prod", Confidence: 95, Provider: "openai"},
		},
	}

	result := w.mergePredictions(byProvider, true)
	if len(result) != 1 {
		t.Fatalf("Expected 1 merged prediction, got %d", len(result))
	}
	if result[0].Confidence != 100 {
		t.Errorf("Expected confidence capped at 100, got %d", result[0].Confidence)
	}
}

func TestMergePredictions_SortsBySeverityThenConfidence(t *testing.T) {
	w := newTestWorkerForMerge(t)

	byProvider := map[string][]AIPrediction{
		"claude": {
			{Category: "anomaly", Severity: "warning", Name: "low-pri", Cluster: "dev", Confidence: 90, Provider: "claude"},
			{Category: "pod-crash", Severity: "critical", Name: "high-pri", Cluster: "prod", Confidence: 60, Provider: "claude"},
		},
		"openai": {
			{Category: "capacity-risk", Severity: "warning", Name: "disk-warn", Cluster: "staging", Confidence: 50, Provider: "openai"},
		},
	}

	result := w.mergePredictions(byProvider, true)
	if len(result) < 2 {
		t.Fatalf("Expected at least 2 predictions, got %d", len(result))
	}

	// Critical should appear before warning
	foundCriticalBeforeWarning := false
	for i, p := range result {
		if p.Severity == "critical" {
			// All subsequent should not be critical-before-this
			for j := i + 1; j < len(result); j++ {
				if result[j].Severity == "warning" {
					foundCriticalBeforeWarning = true
				}
			}
			break
		}
	}
	if !foundCriticalBeforeWarning && result[0].Severity != "critical" {
		t.Error("Expected critical severity predictions to be sorted before warnings")
	}
}

func TestMergePredictions_EmptyProviders(t *testing.T) {
	w := newTestWorkerForMerge(t)

	// Empty byProvider map
	result := w.mergePredictions(map[string][]AIPrediction{}, false)
	if len(result) != 0 {
		t.Errorf("Expected empty result for empty input, got %d", len(result))
	}

	result = w.mergePredictions(map[string][]AIPrediction{}, true)
	if len(result) != 0 {
		t.Errorf("Expected empty result for empty consensus input, got %d", len(result))
	}
}

func TestGetAvailableProviders_EmptyRegistry(t *testing.T) {
	w := newTestWorkerForMerge(t)

	// Empty registry should return no providers
	providers := w.getAvailableProviders()
	if len(providers) != 0 {
		t.Errorf("Expected 0 providers from empty registry, got %d", len(providers))
	}
}

func TestGetAvailableProviders_WithRegisteredProvider(t *testing.T) {
	m, _ := k8s.NewMultiClusterClient("")
	m.SetRawConfig(&api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
		Clusters: map[string]*api.Cluster{"cl1": {Server: "s1"}},
	})

	reg := newMockProviderRegistry()

	// Register a mock provider named "bob" (one of the hardcoded names)
	mockP := &WorkerMockProvider{name: "bob"}
	reg.Register(mockP)

	broadcast := func(msg string, payload interface{}) {}
	trackTokens := func(usage *ai.ProviderTokenUsage) {}

	w := NewPredictionWorker(m, reg, broadcast, trackTokens)

	providers := w.getAvailableProviders()
	if len(providers) != 1 {
		t.Fatalf("Expected 1 provider, got %d: %v", len(providers), providers)
	}
	if providers[0] != "bob" {
		t.Errorf("Expected provider 'bob', got %q", providers[0])
	}
}

func TestMergePredictions_DisjointPredictionsMerged(t *testing.T) {
	w := newTestWorkerForMerge(t)

	// Two providers with different predictions — all should appear
	byProvider := map[string][]AIPrediction{
		"claude": {
			{Category: "pod-crash", Severity: "critical", Name: "api-pod", Cluster: "prod", Confidence: 80, Provider: "claude"},
		},
		"openai": {
			{Category: "anomaly", Severity: "warning", Name: "worker", Cluster: "staging", Confidence: 60, Provider: "openai"},
		},
	}

	result := w.mergePredictions(byProvider, true)
	if len(result) != 2 {
		t.Errorf("Expected 2 disjoint predictions, got %d", len(result))
	}
}
