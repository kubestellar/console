package stellar

import (
	"context"
	"errors"
	"testing"

	"github.com/kubestellar/console/pkg/stellar/providers"
)

// mockProvider implements providers.Provider for unit tests.
type mockProvider struct {
	response *providers.GenerateResponse
	err      error
}

func (m *mockProvider) Generate(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
	return m.response, m.err
}

func (m *mockProvider) Name() string              { return "mock" }
func (m *mockProvider) Health(_ context.Context) providers.HealthResult { return providers.HealthResult{Available: true} }
func (m *mockProvider) SupportsStreaming() bool    { return false }

func TestEvaluate_NilProvider_UsesFallback(t *testing.T) {
	e := NewStellarEvaluator(nil)
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "CrashLoopBackOff",
		Type:   "Warning",
	}, providers.ResolvedProvider{Provider: nil})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "critical" {
		t.Errorf("expected critical severity from fallback, got %s", result.Severity)
	}
	if !result.ShouldShow {
		t.Error("expected ShouldShow=true from fallback for CrashLoopBackOff")
	}
}

func TestEvaluate_ProviderError_UsesFallback(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{err: errors.New("network timeout")}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "OOMKilled",
		Type:   "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "critical" {
		t.Errorf("expected critical from fallback on provider error, got %s", result.Severity)
	}
}

func TestEvaluate_ValidJSON_ParsesCorrectly(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{
		response: &providers.GenerateResponse{
			Content: `{"should_show":true,"severity":"warning","reasoning":"liveness probe failing","action_hints":["investigate"]}`,
		},
	}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason:    "Unhealthy",
		Namespace: "default",
		Name:      "my-pod",
		Kind:      "Pod",
		Cluster:   "prod",
		Message:   "Liveness probe failed",
		Type:      "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.ShouldShow {
		t.Error("expected ShouldShow=true")
	}
	if result.Severity != "warning" {
		t.Errorf("expected warning, got %s", result.Severity)
	}
	if result.Reasoning != "liveness probe failing" {
		t.Errorf("expected reasoning='liveness probe failing', got %q", result.Reasoning)
	}
	if len(result.ActionHints) != 1 || result.ActionHints[0] != "investigate" {
		t.Errorf("unexpected action_hints: %v", result.ActionHints)
	}
}

func TestEvaluate_MarkdownFences_StrippedCorrectly(t *testing.T) {
	e := NewStellarEvaluator(nil)
	// Some LLMs wrap JSON in ```json ... ```
	mp := &mockProvider{
		response: &providers.GenerateResponse{
			Content: "```json\n{\"should_show\":false,\"severity\":\"ignore\",\"reasoning\":\"normal scaling\"}\n```",
		},
	}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "ScalingReplicaSet",
		Type:   "Normal",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.ShouldShow {
		t.Error("expected ShouldShow=false")
	}
	if result.Severity != "ignore" {
		t.Errorf("expected ignore, got %s", result.Severity)
	}
}

func TestEvaluate_MarkdownFences_NoLanguageTag(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{
		response: &providers.GenerateResponse{
			Content: "```\n{\"should_show\":true,\"severity\":\"critical\",\"reasoning\":\"crash loop\"}\n```",
		},
	}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "CrashLoopBackOff",
		Type:   "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "critical" {
		t.Errorf("expected critical, got %s", result.Severity)
	}
}

func TestEvaluate_InvalidJSON_UsesFallback(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{
		response: &providers.GenerateResponse{
			Content: "I think this event is important because...",
		},
	}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "FailedScheduling",
		Type:   "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Should fall back to deterministic rules
	if result.Severity != "critical" {
		t.Errorf("expected critical from fallback for FailedScheduling, got %s", result.Severity)
	}
}

func TestEvaluate_InvalidSeverity_UsesFallback(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{
		response: &providers.GenerateResponse{
			Content: `{"should_show":true,"severity":"high","reasoning":"something bad"}`,
		},
	}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "BackOff",
		Type:   "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// "high" is not a valid severity, should fall back
	if result.Severity != "warning" {
		t.Errorf("expected warning from fallback for BackOff, got %s", result.Severity)
	}
}

func TestEvaluate_WithRecommendedAction(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{
		response: &providers.GenerateResponse{
			Content: `{"should_show":true,"severity":"critical","reasoning":"crash loop","action_hints":["investigate","restart"],"recommended_action":{"type":"RestartDeployment","reasoning":"3+ crash restarts"}}`,
		},
	}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "CrashLoopBackOff",
		Type:   "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.RecommendedAction == nil {
		t.Fatal("expected recommended_action to be populated")
	}
	if result.RecommendedAction.Type != "RestartDeployment" {
		t.Errorf("expected type=RestartDeployment, got %s", result.RecommendedAction.Type)
	}
}

func TestEvaluate_WhitespaceAroundJSON(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{
		response: &providers.GenerateResponse{
			Content: "\n  {\"should_show\":true,\"severity\":\"info\",\"reasoning\":\"noteworthy\",\"action_hints\":[]}\n  ",
		},
	}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "CustomReason",
		Type:   "Normal",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "info" {
		t.Errorf("expected info, got %s", result.Severity)
	}
}

func TestEvaluate_EmptyResponse_UsesFallback(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{
		response: &providers.GenerateResponse{Content: ""},
	}

	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "Pulled",
		Type:   "Normal",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Empty string won't parse as JSON → fallback; Pulled is noise
	if result.ShouldShow {
		t.Error("expected ShouldShow=false from fallback for Pulled")
	}
}

func TestFallbackEvaluate_RestartableReasons(t *testing.T) {
	e := NewStellarEvaluator(nil)

	// CrashLoopBackOff should get a RestartDeployment recommendation
	result := e.FallbackEvaluate(RawK8sEvent{Reason: "CrashLoopBackOff", Type: "Warning"})
	if result.RecommendedAction == nil {
		t.Fatal("expected recommended_action for CrashLoopBackOff")
	}
	if result.RecommendedAction.Type != "RestartDeployment" {
		t.Errorf("expected RestartDeployment, got %s", result.RecommendedAction.Type)
	}

	// BackOff (warning + restartable) should also get RestartDeployment
	result = e.FallbackEvaluate(RawK8sEvent{Reason: "BackOff", Type: "Warning"})
	if result.RecommendedAction == nil {
		t.Fatal("expected recommended_action for BackOff")
	}
	if result.RecommendedAction.Type != "RestartDeployment" {
		t.Errorf("expected RestartDeployment, got %s", result.RecommendedAction.Type)
	}

	// OOMKilled is critical but NOT restartable — no recommendation
	result = e.FallbackEvaluate(RawK8sEvent{Reason: "OOMKilled", Type: "Warning"})
	if result.RecommendedAction != nil {
		t.Errorf("OOMKilled should NOT have a recommended action, got %+v", result.RecommendedAction)
	}

	// FailedScheduling is critical but NOT restartable
	result = e.FallbackEvaluate(RawK8sEvent{Reason: "FailedScheduling", Type: "Warning"})
	if result.RecommendedAction != nil {
		t.Errorf("FailedScheduling should NOT have a recommended action, got %+v", result.RecommendedAction)
	}
}
