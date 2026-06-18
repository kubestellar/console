package stellar

import (
	"context"
	"errors"
	"testing"

	"github.com/kubestellar/console/pkg/stellar/providers"
)

// mockProvider implements providers.Provider for testing the Evaluate method.
type mockProvider struct {
	generateFunc func(ctx context.Context, req providers.GenerateRequest) (*providers.GenerateResponse, error)
}

func (m *mockProvider) Generate(ctx context.Context, req providers.GenerateRequest) (*providers.GenerateResponse, error) {
	return m.generateFunc(ctx, req)
}
func (m *mockProvider) Name() string                           { return "mock" }
func (m *mockProvider) Health(_ context.Context) providers.HealthResult { return providers.HealthResult{Available: true} }
func (m *mockProvider) SupportsStreaming() bool                 { return false }

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
		t.Errorf("expected severity=critical from fallback, got %s", result.Severity)
	}
	if !result.ShouldShow {
		t.Error("expected ShouldShow=true from fallback for CrashLoopBackOff")
	}
}

func TestEvaluate_ValidJSON_Critical(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return &providers.GenerateResponse{
			Content: `{"should_show":true,"severity":"critical","reasoning":"crash loop detected","action_hints":["investigate","restart"]}`,
		}, nil
	}}
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "CrashLoopBackOff", Type: "Warning", Cluster: "prod",
		Namespace: "default", Name: "api-server", Kind: "Pod",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "critical" {
		t.Errorf("expected severity=critical, got %s", result.Severity)
	}
	if !result.ShouldShow {
		t.Error("expected ShouldShow=true")
	}
	if result.Reasoning != "crash loop detected" {
		t.Errorf("expected reasoning='crash loop detected', got %q", result.Reasoning)
	}
}

func TestEvaluate_ValidJSON_Ignore(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return &providers.GenerateResponse{
			Content: `{"should_show":false,"severity":"ignore","reasoning":"normal rolling update"}`,
		}, nil
	}}
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "ScalingReplicaSet", Type: "Normal",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.ShouldShow {
		t.Error("expected ShouldShow=false")
	}
	if result.Severity != "ignore" {
		t.Errorf("expected severity=ignore, got %s", result.Severity)
	}
}

func TestEvaluate_ValidJSON_Warning(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return &providers.GenerateResponse{
			Content: `{"should_show":true,"severity":"warning","reasoning":"liveness probe failing","action_hints":["investigate"]}`,
		}, nil
	}}
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "Unhealthy", Type: "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "warning" {
		t.Errorf("expected severity=warning, got %s", result.Severity)
	}
}

func TestEvaluate_ValidJSON_Info(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return &providers.GenerateResponse{
			Content: `{"should_show":true,"severity":"info","reasoning":"noteworthy event","action_hints":[]}`,
		}, nil
	}}
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "SomeReason", Type: "Normal",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "info" {
		t.Errorf("expected severity=info, got %s", result.Severity)
	}
}

func TestEvaluate_MarkdownFencedJSON(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return &providers.GenerateResponse{
			Content: "```json\n{\"should_show\":true,\"severity\":\"critical\",\"reasoning\":\"OOM kill\",\"action_hints\":[\"investigate\"]}\n```",
		}, nil
	}}
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "OOMKilled", Type: "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "critical" {
		t.Errorf("expected severity=critical after stripping markdown fence, got %s", result.Severity)
	}
	if result.Reasoning != "OOM kill" {
		t.Errorf("expected reasoning='OOM kill', got %q", result.Reasoning)
	}
}

func TestEvaluate_InvalidJSON_FallsBackToRules(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return &providers.GenerateResponse{
			Content: "This is not valid JSON at all",
		}, nil
	}}
	// CrashLoopBackOff should fallback to critical via FallbackEvaluate
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "CrashLoopBackOff", Type: "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "critical" {
		t.Errorf("expected fallback severity=critical for CrashLoopBackOff, got %s", result.Severity)
	}
}

func TestEvaluate_LLMError_FallsBackToRules(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return nil, errors.New("LLM service unavailable")
	}}
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "Failed", Type: "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Severity != "warning" {
		t.Errorf("expected fallback severity=warning for Failed, got %s", result.Severity)
	}
}

func TestEvaluate_UnknownSeverity_FallsBackToRules(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return &providers.GenerateResponse{
			Content: `{"should_show":true,"severity":"catastrophic","reasoning":"very bad"}`,
		}, nil
	}}
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "OOMKilling", Type: "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Unknown severity "catastrophic" should trigger fallback; OOMKilling is critical in rules
	if result.Severity != "critical" {
		t.Errorf("expected fallback severity=critical for OOMKilling, got %s", result.Severity)
	}
}

func TestEvaluate_WithRecommendedAction(t *testing.T) {
	e := NewStellarEvaluator(nil)
	mp := &mockProvider{generateFunc: func(_ context.Context, _ providers.GenerateRequest) (*providers.GenerateResponse, error) {
		return &providers.GenerateResponse{
			Content: `{"should_show":true,"severity":"critical","reasoning":"crash loop","action_hints":["investigate","restart"],"recommended_action":{"type":"RestartDeployment","reasoning":"3+ crash restarts"}}`,
		}, nil
	}}
	result, err := e.Evaluate(context.Background(), RawK8sEvent{
		Reason: "CrashLoopBackOff", Type: "Warning",
	}, providers.ResolvedProvider{Provider: mp, Model: "test-model"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.RecommendedAction == nil {
		t.Fatal("expected recommended_action to be set")
	}
	if result.RecommendedAction.Type != "RestartDeployment" {
		t.Errorf("expected action type=RestartDeployment, got %s", result.RecommendedAction.Type)
	}
}

func TestFallbackEvaluate_RestartableReasons_HaveAction(t *testing.T) {
	e := NewStellarEvaluator(nil)
	for _, reason := range []string{"CrashLoopBackOff", "BackOff"} {
		result := e.FallbackEvaluate(RawK8sEvent{Reason: reason, Type: "Warning"})
		if result.RecommendedAction == nil {
			t.Errorf("%s: expected RecommendedAction to be set", reason)
			continue
		}
		if result.RecommendedAction.Type != "RestartDeployment" {
			t.Errorf("%s: expected action type=RestartDeployment, got %s", reason, result.RecommendedAction.Type)
		}
	}
}

func TestFallbackEvaluate_NonRestartableCritical_NoAction(t *testing.T) {
	e := NewStellarEvaluator(nil)
	// These are critical but should NOT have a RestartDeployment recommendation
	for _, reason := range []string{"OOMKilling", "OOMKilled", "Evicted", "FailedScheduling", "NodeNotReady", "FailedMount"} {
		result := e.FallbackEvaluate(RawK8sEvent{Reason: reason, Type: "Warning"})
		if result.RecommendedAction != nil {
			t.Errorf("%s: expected no RecommendedAction (needs investigation, not restart), got type=%s",
				reason, result.RecommendedAction.Type)
		}
	}
}
