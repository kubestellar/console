package agent

import (
	"testing"
)

func TestProviderTypeAliases(t *testing.T) {
	// Verify the capability constants are correctly re-exported
	if CapabilityChat == 0 {
		t.Error("CapabilityChat should be non-zero")
	}
	if CapabilityToolExec == 0 {
		t.Error("CapabilityToolExec should be non-zero")
	}
	if CapabilityChat == CapabilityToolExec {
		t.Error("CapabilityChat and CapabilityToolExec should be distinct")
	}
}

func TestCapabilityHasCapability(t *testing.T) {
	both := CapabilityChat | CapabilityToolExec
	if !both.HasCapability(CapabilityChat) {
		t.Error("combined capability should include CapabilityChat")
	}
	if !both.HasCapability(CapabilityToolExec) {
		t.Error("combined capability should include CapabilityToolExec")
	}
	if CapabilityChat.HasCapability(CapabilityToolExec) {
		t.Error("CapabilityChat alone should not include CapabilityToolExec")
	}
}

func TestMaxStderrBytes(t *testing.T) {
	// maxStderrBytes should be 1MB
	if maxStderrBytes != 1<<20 {
		t.Errorf("maxStderrBytes = %d, want %d (1MB)", maxStderrBytes, 1<<20)
	}
}

func TestMixedModeConfigZeroValue(t *testing.T) {
	// MixedModeConfig should be usable with zero values
	var cfg MixedModeConfig
	if cfg.Enabled {
		t.Error("zero-value MixedModeConfig should have Enabled=false")
	}
	if cfg.ThinkingAgent != "" {
		t.Error("zero-value MixedModeConfig should have empty ThinkingAgent")
	}
	if cfg.ExecutionAgent != "" {
		t.Error("zero-value MixedModeConfig should have empty ExecutionAgent")
	}
}

func TestMixedModeConfigFields(t *testing.T) {
	cfg := MixedModeConfig{
		ThinkingAgent:  "claude",
		ExecutionAgent: "codex",
		Enabled:        true,
	}
	if cfg.ThinkingAgent != "claude" {
		t.Errorf("ThinkingAgent = %q, want %q", cfg.ThinkingAgent, "claude")
	}
	if cfg.ExecutionAgent != "codex" {
		t.Errorf("ExecutionAgent = %q, want %q", cfg.ExecutionAgent, "codex")
	}
	if !cfg.Enabled {
		t.Error("Enabled should be true")
	}
}

func TestChatRequestZeroValue(t *testing.T) {
	// ChatRequest type alias should compile and instantiate
	var req ChatRequest
	if req.SessionID != "" {
		t.Error("zero-value ChatRequest should have empty SessionID")
	}
	if req.Prompt != "" {
		t.Error("zero-value ChatRequest should have empty Prompt")
	}
	if req.History != nil {
		t.Error("zero-value ChatRequest should have nil History")
	}
}

func TestChatResponseZeroValue(t *testing.T) {
	// ChatResponse type alias should compile and instantiate
	var resp ChatResponse
	if resp.Content != "" {
		t.Error("zero-value ChatResponse should have empty Content")
	}
	if resp.Done {
		t.Error("zero-value ChatResponse should have Done=false")
	}
	if resp.ExitCode != 0 {
		t.Error("zero-value ChatResponse should have ExitCode=0")
	}
}
