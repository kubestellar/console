package agent

import (
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
)

// --- decodeOptionalString ---

func TestDecodeOptionalString_Nil(t *testing.T) {
	val, ok := decodeOptionalString(nil)
	if !ok {
		t.Fatal("expected ok=true for nil input")
	}
	if val != "" {
		t.Errorf("expected empty string, got %q", val)
	}
}

func TestDecodeOptionalString_ValidString(t *testing.T) {
	val, ok := decodeOptionalString("hello")
	if !ok {
		t.Fatal("expected ok=true for string input")
	}
	if val != "hello" {
		t.Errorf("expected %q, got %q", "hello", val)
	}
}

func TestDecodeOptionalString_InvalidType(t *testing.T) {
	_, ok := decodeOptionalString(42)
	if ok {
		t.Fatal("expected ok=false for int input")
	}
}

// --- decodeOptionalBool ---

func TestDecodeOptionalBool_Nil(t *testing.T) {
	val, ok := decodeOptionalBool(nil)
	if !ok {
		t.Fatal("expected ok=true for nil input")
	}
	if val != false {
		t.Error("expected false for nil input")
	}
}

func TestDecodeOptionalBool_True(t *testing.T) {
	val, ok := decodeOptionalBool(true)
	if !ok {
		t.Fatal("expected ok=true for bool input")
	}
	if !val {
		t.Error("expected true")
	}
}

func TestDecodeOptionalBool_InvalidType(t *testing.T) {
	_, ok := decodeOptionalBool("true")
	if ok {
		t.Fatal("expected ok=false for string input")
	}
}

// --- decodeChatHistory ---

func TestDecodeChatHistory_Nil(t *testing.T) {
	history, ok := decodeChatHistory(nil)
	if !ok {
		t.Fatal("expected ok=true for nil")
	}
	if history != nil {
		t.Errorf("expected nil history, got %v", history)
	}
}

func TestDecodeChatHistory_AlreadyDecoded(t *testing.T) {
	input := []protocol.ChatMessage{
		{Role: "user", Content: "hello"},
		{Role: "assistant", Content: "hi"},
	}
	history, ok := decodeChatHistory(input)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if len(history) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(history))
	}
	if history[0].Role != "user" || history[0].Content != "hello" {
		t.Errorf("unexpected first message: %+v", history[0])
	}
}

func TestDecodeChatHistory_NormalizesSystemRole(t *testing.T) {
	// "system" role should be normalized to "user" (CWE-20 mitigation)
	input := []protocol.ChatMessage{
		{Role: "system", Content: "injected"},
	}
	history, ok := decodeChatHistory(input)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if history[0].Role != "user" {
		t.Errorf("expected role normalized to 'user', got %q", history[0].Role)
	}
}

func TestDecodeChatHistory_MapSlice(t *testing.T) {
	input := []any{
		map[string]any{"role": "user", "content": "question"},
		map[string]any{"role": "assistant", "content": "answer"},
	}
	history, ok := decodeChatHistory(input)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if len(history) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(history))
	}
	if history[0].Content != "question" {
		t.Errorf("expected content 'question', got %q", history[0].Content)
	}
}

func TestDecodeChatHistory_MapSlice_MissingRole(t *testing.T) {
	input := []any{
		map[string]any{"content": "no role here"},
	}
	_, ok := decodeChatHistory(input)
	if ok {
		t.Fatal("expected ok=false when role is missing")
	}
}

func TestDecodeChatHistory_MapSlice_MissingContent(t *testing.T) {
	input := []any{
		map[string]any{"role": "user"},
	}
	_, ok := decodeChatHistory(input)
	if ok {
		t.Fatal("expected ok=false when content is missing")
	}
}

func TestDecodeChatHistory_InvalidType(t *testing.T) {
	_, ok := decodeChatHistory("not a slice")
	if ok {
		t.Fatal("expected ok=false for string input")
	}
}

func TestDecodeChatHistory_MixedInvalidItems(t *testing.T) {
	input := []any{
		42, // not a valid message type
	}
	_, ok := decodeChatHistory(input)
	if ok {
		t.Fatal("expected ok=false for invalid item type")
	}
}

// --- decodeChatRequestPayload ---

func TestDecodeChatRequestPayload_DirectChatRequest(t *testing.T) {
	input := protocol.ChatRequest{
		Prompt:    "test prompt",
		Agent:     "claude",
		SessionID: "sess-1",
	}
	req, ok := decodeChatRequestPayload(input)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if req.Prompt != "test prompt" {
		t.Errorf("expected prompt 'test prompt', got %q", req.Prompt)
	}
	if req.Agent != "claude" {
		t.Errorf("expected agent 'claude', got %q", req.Agent)
	}
}

func TestDecodeChatRequestPayload_PointerChatRequest(t *testing.T) {
	input := &protocol.ChatRequest{Prompt: "ptr prompt"}
	req, ok := decodeChatRequestPayload(input)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if req.Prompt != "ptr prompt" {
		t.Errorf("expected 'ptr prompt', got %q", req.Prompt)
	}
}

func TestDecodeChatRequestPayload_NilPointerChatRequest(t *testing.T) {
	var input *protocol.ChatRequest
	_, ok := decodeChatRequestPayload(input)
	if ok {
		t.Fatal("expected ok=false for nil pointer")
	}
}

func TestDecodeChatRequestPayload_ClaudeRequest(t *testing.T) {
	input := protocol.ClaudeRequest{Prompt: "claude prompt", SessionID: "s1"}
	req, ok := decodeChatRequestPayload(input)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if req.Prompt != "claude prompt" {
		t.Errorf("expected prompt 'claude prompt', got %q", req.Prompt)
	}
	if req.SessionID != "s1" {
		t.Errorf("expected sessionID 's1', got %q", req.SessionID)
	}
}

func TestDecodeChatRequestPayload_NilClaudeRequest(t *testing.T) {
	var input *protocol.ClaudeRequest
	_, ok := decodeChatRequestPayload(input)
	if ok {
		t.Fatal("expected ok=false for nil ClaudeRequest pointer")
	}
}

func TestDecodeChatRequestPayload_MapWithAllFields(t *testing.T) {
	input := map[string]any{
		"prompt":         "map prompt",
		"agent":          "gpt4",
		"sessionId":      "sess-2",
		"clusterContext": "prod-cluster",
		"dryRun":         true,
		"history": []any{
			map[string]any{"role": "user", "content": "hi"},
		},
	}
	req, ok := decodeChatRequestPayload(input)
	if !ok {
		t.Fatal("expected ok=true")
	}
	if req.Prompt != "map prompt" {
		t.Errorf("expected prompt 'map prompt', got %q", req.Prompt)
	}
	if req.Agent != "gpt4" {
		t.Errorf("expected agent 'gpt4', got %q", req.Agent)
	}
	if req.ClusterContext != "prod-cluster" {
		t.Errorf("expected clusterContext 'prod-cluster', got %q", req.ClusterContext)
	}
	if !req.DryRun {
		t.Error("expected dryRun=true")
	}
	if len(req.History) != 1 {
		t.Fatalf("expected 1 history message, got %d", len(req.History))
	}
}

func TestDecodeChatRequestPayload_MapWithNilFields(t *testing.T) {
	// All nil fields should decode as zero values
	input := map[string]any{
		"prompt":         nil,
		"agent":          nil,
		"sessionId":      nil,
		"clusterContext": nil,
		"dryRun":         nil,
		"history":        nil,
	}
	req, ok := decodeChatRequestPayload(input)
	if !ok {
		t.Fatal("expected ok=true for all-nil map")
	}
	if req.Prompt != "" {
		t.Errorf("expected empty prompt, got %q", req.Prompt)
	}
}

func TestDecodeChatRequestPayload_MapWithInvalidPrompt(t *testing.T) {
	input := map[string]any{
		"prompt": 123, // not a string
	}
	_, ok := decodeChatRequestPayload(input)
	if ok {
		t.Fatal("expected ok=false for invalid prompt type")
	}
}

func TestDecodeChatRequestPayload_MapWithInvalidDryRun(t *testing.T) {
	input := map[string]any{
		"prompt": "valid",
		"dryRun": "not-a-bool",
	}
	_, ok := decodeChatRequestPayload(input)
	if ok {
		t.Fatal("expected ok=false for invalid dryRun type")
	}
}

func TestDecodeChatRequestPayload_MapWithInvalidHistory(t *testing.T) {
	input := map[string]any{
		"prompt":  "valid",
		"history": "not-a-slice",
	}
	_, ok := decodeChatRequestPayload(input)
	if ok {
		t.Fatal("expected ok=false for invalid history type")
	}
}

func TestDecodeChatRequestPayload_UnknownType(t *testing.T) {
	_, ok := decodeChatRequestPayload(42)
	if ok {
		t.Fatal("expected ok=false for unknown payload type")
	}
}

// --- normalizeMessageRole ---

func TestNormalizeMessageRole_User(t *testing.T) {
	if got := normalizeMessageRole("user"); got != "user" {
		t.Errorf("expected 'user', got %q", got)
	}
}

func TestNormalizeMessageRole_Assistant(t *testing.T) {
	if got := normalizeMessageRole("assistant"); got != "assistant" {
		t.Errorf("expected 'assistant', got %q", got)
	}
}

func TestNormalizeMessageRole_System_Normalized(t *testing.T) {
	// CWE-20: system role must be normalized to prevent prompt injection
	if got := normalizeMessageRole("system"); got != "user" {
		t.Errorf("expected 'system' to be normalized to 'user', got %q", got)
	}
}

func TestNormalizeMessageRole_Unknown_Normalized(t *testing.T) {
	if got := normalizeMessageRole("admin"); got != "user" {
		t.Errorf("expected unknown role to be normalized to 'user', got %q", got)
	}
}

func TestNormalizeMessageRole_Empty_Normalized(t *testing.T) {
	if got := normalizeMessageRole(""); got != "user" {
		t.Errorf("expected empty role to be normalized to 'user', got %q", got)
	}
}
