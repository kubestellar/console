package ai

import "testing"

func TestProviderInfo_Fields(t *testing.T) {
	info := ProviderInfo{
		Name:         "test-provider",
		DisplayName:  "Test Provider",
		Description:  "A test AI provider",
		Provider:     "testcorp",
		Available:    true,
		Capabilities: int(CapabilityChat | CapabilityToolExec),
	}

	if info.Name != "test-provider" {
		t.Errorf("expected Name 'test-provider', got %q", info.Name)
	}
	if info.DisplayName != "Test Provider" {
		t.Errorf("expected DisplayName 'Test Provider', got %q", info.DisplayName)
	}
	if info.Description != "A test AI provider" {
		t.Errorf("expected Description 'A test AI provider', got %q", info.Description)
	}
	if info.Provider != "testcorp" {
		t.Errorf("expected Provider 'testcorp', got %q", info.Provider)
	}
	if !info.Available {
		t.Error("expected Available to be true")
	}
	// Capabilities should round-trip through int
	cap := ProviderCapability(info.Capabilities)
	if !cap.HasCapability(CapabilityChat) {
		t.Error("expected capabilities to include Chat after int conversion")
	}
	if !cap.HasCapability(CapabilityToolExec) {
		t.Error("expected capabilities to include ToolExec after int conversion")
	}
}

func TestChatRequest_ContextMap(t *testing.T) {
	req := &ChatRequest{
		SessionID:    "sess-123",
		Prompt:       "hello",
		SystemPrompt: "You are helpful",
		Context: map[string]string{
			"cluster":   "prod",
			"namespace": "default",
		},
	}
	if req.Context["cluster"] != "prod" {
		t.Errorf("expected context cluster 'prod', got %q", req.Context["cluster"])
	}
	if req.Context["namespace"] != "default" {
		t.Errorf("expected context namespace 'default', got %q", req.Context["namespace"])
	}
}

func TestChatResponse_ExitCodeAndTruncated(t *testing.T) {
	resp := &ChatResponse{
		Content:   "partial output",
		Agent:     "test",
		ExitCode:  1,
		Truncated: true,
	}
	if resp.ExitCode != 1 {
		t.Errorf("expected ExitCode 1, got %d", resp.ExitCode)
	}
	if !resp.Truncated {
		t.Error("expected Truncated to be true")
	}
}

func TestChatResponse_ToolsExecuted(t *testing.T) {
	resp := &ChatResponse{
		Content:       "done",
		Agent:         "test",
		ToolsExecuted: true,
	}
	if !resp.ToolsExecuted {
		t.Error("expected ToolsExecuted to be true")
	}
}

func TestProviderTokenUsage(t *testing.T) {
	usage := &ProviderTokenUsage{
		InputTokens:  100,
		OutputTokens: 50,
		TotalTokens:  150,
	}
	if usage.TotalTokens != usage.InputTokens+usage.OutputTokens {
		t.Errorf("expected TotalTokens = Input + Output, got %d", usage.TotalTokens)
	}
}

func TestHandshakeResult_Ready(t *testing.T) {
	result := &HandshakeResult{
		Ready:         true,
		State:         "connected",
		Message:       "Provider is ready",
		Prerequisites: []string{"desktop-app"},
		Version:       "1.2.3",
		CliPath:       "/usr/bin/test-provider",
	}
	if !result.Ready {
		t.Error("expected Ready to be true")
	}
	if result.State != "connected" {
		t.Errorf("expected State 'connected', got %q", result.State)
	}
	if len(result.Prerequisites) != 1 {
		t.Errorf("expected 1 prerequisite, got %d", len(result.Prerequisites))
	}
}

func TestHandshakeResult_Failed(t *testing.T) {
	result := &HandshakeResult{
		Ready:   false,
		State:   "failed",
		Message: "binary not found",
	}
	if result.Ready {
		t.Error("expected Ready to be false for failed handshake")
	}
	if result.State != "failed" {
		t.Errorf("expected State 'failed', got %q", result.State)
	}
}
