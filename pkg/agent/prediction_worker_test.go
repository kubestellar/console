package agent

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/kubestellar/console/pkg/k8s"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	"k8s.io/client-go/tools/clientcmd/api"
)

type WorkerMockProvider struct {
	name string
}

func (m *WorkerMockProvider) Name() string        { return m.name }
func (m *WorkerMockProvider) DisplayName() string { return m.name }
func (m *WorkerMockProvider) Description() string { return m.name }
func (m *WorkerMockProvider) Provider() string    { return "mock" }
func (m *WorkerMockProvider) IsAvailable() bool   { return true }
func (m *WorkerMockProvider) Capabilities() ProviderCapability { return CapabilityChat }
func (m *WorkerMockProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	// Return a JSON that looks like predictions
	result := struct {
		Predictions []map[string]interface{} `json:"predictions"`
	}{
		Predictions: []map[string]interface{}{
			{
				"category":       "restart",
				"severity":       "high",
				"name":           "pod1",
				"cluster":        "c1",
				"namespace":      "default",
				"reason":         "Too many restarts",
				"reasonDetailed": "Pod pod1 has restarted 5 times in the last hour",
				"confidence":     90,
			},
		},
	}
	data, _ := json.Marshal(result)
	return &ChatResponse{
		Content: string(data),
		Agent:   m.name,
		Done:    true,
	}, nil
}

func (m *WorkerMockProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(string)) (*ChatResponse, error) {
	resp, err := m.Chat(ctx, req)
	if err == nil && onChunk != nil {
		onChunk(resp.Content)
	}
	return resp, err
}

func TestPredictionWorker(t *testing.T) {
	// 1. Setup mock k8s client
	m, _ := k8s.NewMultiClusterClient("")
	m.SetRawConfig(&api.Config{
		Contexts: map[string]*api.Context{"c1": {Cluster: "cl1"}},
		Clusters: map[string]*api.Cluster{"cl1": {Server: "s1"}},
	})
	m.InjectClient("c1", k8sfake.NewSimpleClientset())

	// 2. Setup mock registry
	reg := &Registry{
		providers:     make(map[string]AIProvider),
		selectedAgent: make(map[string]string),
	}
	mockP := &WorkerMockProvider{name: "mock-ai"}
	reg.Register(mockP)
	reg.SetDefault("mock-ai")

	var broadcastedMsg string
	broadcast := func(msg string, payload interface{}) {
		broadcastedMsg = msg
	}

	trackTokens := func(usage *ProviderTokenUsage) {}

	worker := NewPredictionWorker(m, reg, broadcast, trackTokens)

	// 3. Test UpdateSettings
	settings := DefaultPredictionSettings()
	settings.AIEnabled = true
	worker.UpdateSettings(settings)

	if worker.GetSettings().AIEnabled != true {
		t.Error("Settings not updated")
	}

	// 4. Test runAnalysis (synchronously)
	worker.runAnalysis([]string{"mock-ai"})

	resp := worker.GetPredictions()
	if len(resp.Predictions) != 1 {
		t.Errorf("Expected 1 prediction, got %d", len(resp.Predictions))
	}
	if resp.Predictions[0].Name != "pod1" {
		t.Errorf("Expected pod1, got %s", resp.Predictions[0].Name)
	}
	if broadcastedMsg != "ai_predictions_updated" {
		t.Errorf("Expected broadcast 'ai_predictions_updated', got %q", broadcastedMsg)
	}

	// 5. Test TriggerAnalysis (asynchronously)
	err := worker.TriggerAnalysis([]string{"mock-ai"})
	if err != nil {
		t.Fatalf("TriggerAnalysis failed: %v", err)
	}

	// Wait for async analysis
	time.Sleep(100 * time.Millisecond)
	if worker.IsAnalyzing() {
		time.Sleep(200 * time.Millisecond)
	}

	if worker.IsAnalyzing() {
		t.Error("Worker still running analysis")
	}
}
