package agent

import (
	"encoding/json"
	"testing"

	"github.com/kubestellar/console/pkg/ai"
)

func TestMaxStderrBytes(t *testing.T) {
	const expected int64 = 1 << 20 // 1 MB
	if maxStderrBytes != expected {
		t.Errorf("maxStderrBytes = %d, want %d", maxStderrBytes, expected)
	}
}

func TestCapabilityConstants_MatchAIPackage(t *testing.T) {
	if CapabilityChat != ai.CapabilityChat {
		t.Errorf("CapabilityChat = %v, want ai.CapabilityChat", CapabilityChat)
	}
	if CapabilityToolExec != ai.CapabilityToolExec {
		t.Errorf("CapabilityToolExec = %v, want ai.CapabilityToolExec", CapabilityToolExec)
	}
}

func TestMixedModeConfig_ZeroValue(t *testing.T) {
	var cfg MixedModeConfig
	if cfg.Enabled {
		t.Error("zero-value MixedModeConfig.Enabled should be false")
	}
	if cfg.ThinkingAgent != "" {
		t.Errorf("zero-value ThinkingAgent should be empty, got %q", cfg.ThinkingAgent)
	}
	if cfg.ExecutionAgent != "" {
		t.Errorf("zero-value ExecutionAgent should be empty, got %q", cfg.ExecutionAgent)
	}
}

func TestMixedModeConfig_JSONRoundTrip(t *testing.T) {
	original := MixedModeConfig{
		ThinkingAgent:  "claude",
		ExecutionAgent: "bob",
		Enabled:        true,
	}

	data, err := json.Marshal(original)
	if err != nil {
		t.Fatalf("failed to marshal MixedModeConfig: %v", err)
	}

	var decoded MixedModeConfig
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal MixedModeConfig: %v", err)
	}

	if decoded.ThinkingAgent != original.ThinkingAgent {
		t.Errorf("ThinkingAgent = %q, want %q", decoded.ThinkingAgent, original.ThinkingAgent)
	}
	if decoded.ExecutionAgent != original.ExecutionAgent {
		t.Errorf("ExecutionAgent = %q, want %q", decoded.ExecutionAgent, original.ExecutionAgent)
	}
	if decoded.Enabled != original.Enabled {
		t.Errorf("Enabled = %v, want %v", decoded.Enabled, original.Enabled)
	}
}

func TestMixedModeConfig_JSONFieldNames(t *testing.T) {
	cfg := MixedModeConfig{
		ThinkingAgent:  "a",
		ExecutionAgent: "b",
		Enabled:        true,
	}
	data, _ := json.Marshal(cfg)
	s := string(data)

	for _, want := range []string{`"thinkingAgent"`, `"executionAgent"`, `"enabled"`} {
		if !contains(s, want) {
			t.Errorf("JSON field %s not found in %s", want, s)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(s) > 0 && containsSubstr(s, sub))
}

func containsSubstr(s, sub string) bool {
	for i := 0; i <= len(s)-len(sub); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
