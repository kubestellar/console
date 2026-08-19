package providers

// Additional coverage for CLI provider constructors, prompt building and the
// "CLI not installed" error paths that were previously uncovered (see #22631).
//
// PATH and HOME are pointed at empty temp dirs so detection runs deterministically
// without finding a real binary on the host.

import (
	"context"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/ai"
)

// isolateCLIDetection points PATH and HOME at empty directories so CLI
// detection executes but cannot find a real binary.
func isolateCLIDetection(t *testing.T) {
	t.Helper()
	t.Setenv("PATH", t.TempDir())
	t.Setenv("HOME", t.TempDir())
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

func TestNewCLIProviders_NoCLIOnPath(t *testing.T) {
	isolateCLIDetection(t)

	tests := []struct {
		name     string
		provider ai.Provider
		wantName string
	}{
		{"bob", NewBobProvider(), "bob"},
		{"codex", NewCodexProvider(), "codex"},
		{"gemini-cli", NewGeminiCLIProvider(), "gemini-cli"},
		{"goose", NewGooseProvider(), "goose"},
		{"copilot-cli", NewCopilotCLIProvider(), "copilot-cli"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if tc.provider == nil {
				t.Fatal("constructor returned nil")
			}
			if got := tc.provider.Name(); got != tc.wantName {
				t.Errorf("Name(): got %q, want %q", got, tc.wantName)
			}
			if tc.provider.Description() == "" {
				t.Error("Description() must not be empty")
			}
		})
	}
}

func TestCLIProviders_Refresh_ReRunsDetection(t *testing.T) {
	isolateCLIDetection(t)

	// Refresh() re-runs detection. Detection may still find a binary in a
	// hard-coded system location on some hosts, so only assert that the
	// resulting availability agrees with the detected path.
	tests := []struct {
		name    string
		refresh func() bool
	}{
		{"bob", func() bool { p := &BobProvider{}; p.Refresh(); return p.IsAvailable() == (p.cliPath != "") }},
		{"codex", func() bool { p := &CodexProvider{}; p.Refresh(); return p.IsAvailable() == (p.cliPath != "") }},
		{"gemini-cli", func() bool { p := &GeminiCLIProvider{}; p.Refresh(); return p.IsAvailable() == (p.cliPath != "") }},
		{"goose", func() bool { p := &GooseProvider{}; p.Refresh(); return p.IsAvailable() == (p.cliPath != "") }},
		{"copilot-cli", func() bool { p := &CopilotCLIProvider{}; p.Refresh(); return p.IsAvailable() == (p.cliPath != "") }},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if !tc.refresh() {
				t.Error("IsAvailable() should match whether Refresh() detected a CLI path")
			}
		})
	}
}

// ---------------------------------------------------------------------------
// BobProvider
// ---------------------------------------------------------------------------

func TestBobProvider_BuildPromptWithHistory(t *testing.T) {
	p := &BobProvider{}

	prompt := p.buildPromptWithHistory(&ai.ChatRequest{
		Prompt:       "list pods",
		SystemPrompt: "custom-system-instructions",
		History: []ai.ChatMessage{
			{Role: "user", Content: "earlier question"},
			{Role: "assistant", Content: "earlier answer"},
			{Role: "system", Content: "earlier system note"},
		},
	})

	for _, want := range []string{
		"[System Instructions]",
		"custom-system-instructions",
		"[Conversation History]",
		"User: earlier question",
		"Assistant: earlier answer",
		"System: earlier system note",
		"[User Request]",
		"list pods",
	} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt should contain %q, got:\n%s", want, prompt)
		}
	}
}

func TestBobProvider_BuildPromptWithHistory_DefaultSystemPrompt(t *testing.T) {
	p := &BobProvider{}

	prompt := p.buildPromptWithHistory(&ai.ChatRequest{Prompt: "hi"})

	if strings.Contains(prompt, "[Conversation History]") {
		t.Error("prompt should omit the history section when there is no history")
	}
	if !strings.Contains(prompt, "[System Instructions]") {
		t.Error("prompt should always include the system instructions section")
	}
}

func TestBobProvider_StreamChatNotInstalled(t *testing.T) {
	p := &BobProvider{} // No cliPath set

	_, err := p.StreamChat(t.Context(), &ai.ChatRequest{Prompt: "hi"}, nil)
	if err == nil {
		t.Fatal("Expected error when CLI is not installed")
	}
	if !containsSubstring(err.Error(), "not found") {
		t.Errorf("Expected 'not found' error, got %q", err.Error())
	}
}

// ---------------------------------------------------------------------------
// CLI providers: chat/stream error paths when the CLI is absent
// ---------------------------------------------------------------------------

func TestCLIProviders_StreamChatNotInstalled(t *testing.T) {
	type streamChatter interface {
		StreamChat(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string)) (*ai.ChatResponse, error)
	}

	tests := []struct {
		name     string
		provider streamChatter
	}{
		{"codex", &CodexProvider{}},
		{"gemini-cli", &GeminiCLIProvider{}},
		{"goose", &GooseProvider{}},
		{"copilot-cli", &CopilotCLIProvider{}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := tc.provider.StreamChat(t.Context(), &ai.ChatRequest{Prompt: "hi"}, func(string) {})
			if err == nil {
				t.Fatal("Expected error when CLI is not installed")
			}
			if !containsSubstring(err.Error(), "not found") {
				t.Errorf("Expected 'not found' error, got %q", err.Error())
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ToolAvailabilityStatus
// ---------------------------------------------------------------------------

func TestToolAvailabilityStatus_FallbackResponse(t *testing.T) {
	t.Run("no missing tools returns empty string", func(t *testing.T) {
		if got := (ToolAvailabilityStatus{}).FallbackResponse(); got != "" {
			t.Errorf("FallbackResponse() should be empty when nothing is missing, got %q", got)
		}
	})

	t.Run("missing tools are listed", func(t *testing.T) {
		status := ToolAvailabilityStatus{
			MissingRequired: []string{"kubectl"},
			MissingOptional: []string{"helm"},
		}
		got := status.FallbackResponse()
		if !strings.Contains(got, "kubectl") || !strings.Contains(got, "helm") {
			t.Errorf("FallbackResponse() should list missing tools, got %q", got)
		}
		if !strings.Contains(got, "not completed the task") {
			t.Errorf("FallbackResponse() should state the task is incomplete, got %q", got)
		}
	})
}

// ---------------------------------------------------------------------------
// ClaudeCodeProvider helpers
// ---------------------------------------------------------------------------

func TestTruncateString(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		maxLen int
		want   string
	}{
		{"shorter than max is unchanged", "abc", 10, "abc"},
		{"equal to max is unchanged", "abcde", 5, "abcde"},
		{"longer than max is truncated", "abcdef", 3, "abc..."},
		{"empty string", "", 5, ""},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := TruncateString(tc.input, tc.maxLen); got != tc.want {
				t.Errorf("TruncateString(%q, %d): got %q, want %q", tc.input, tc.maxLen, got, tc.want)
			}
		})
	}
}

func TestClaudeCodeProvider_BuildPromptWithHistory_ClusterContext(t *testing.T) {
	p := &ClaudeCodeProvider{}

	prompt := p.buildPromptWithHistory(&ai.ChatRequest{
		Prompt:  "what is broken?",
		Context: map[string]string{"clusterContext": "prod-east"},
		History: []ai.ChatMessage{
			{Role: "user", Content: "previous user message"},
			{Role: "assistant", Content: "previous assistant message"},
			{Role: "system", Content: "previous system message"},
		},
	})

	for _, want := range []string{
		"CLUSTER CONTEXT",
		"prod-east",
		"User: previous user message",
		"Assistant: previous assistant message",
		"System: previous system message",
		"User: what is broken?",
	} {
		if !strings.Contains(prompt, want) {
			t.Errorf("prompt should contain %q, got:\n%s", want, prompt)
		}
	}
}

// ---------------------------------------------------------------------------
// API providers: capabilities and message building
// ---------------------------------------------------------------------------

func TestClaudeProvider_Capabilities(t *testing.T) {
	p := &ClaudeProvider{}
	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Capabilities() must advertise CapabilityChat")
	}
}

func TestClaudeProvider_BuildMessages_SkipsSystemHistory(t *testing.T) {
	p := &ClaudeProvider{}

	msgs := p.buildMessages(&ai.ChatRequest{
		Prompt: "current question",
		History: []ai.ChatMessage{
			{Role: "system", Content: "system note"},
			{Role: "user", Content: "old question"},
			{Role: "assistant", Content: "old answer"},
		},
	})

	if len(msgs) != 3 {
		t.Fatalf("expected 3 messages (system history skipped), got %d: %v", len(msgs), msgs)
	}
	if msgs[0]["role"] != "user" || msgs[0]["content"] != "old question" {
		t.Errorf("first message should be the historical user message, got %v", msgs[0])
	}
	if msgs[2]["role"] != "user" || msgs[2]["content"] != "current question" {
		t.Errorf("last message should be the current prompt, got %v", msgs[2])
	}
}

func TestGeminiProvider_Capabilities(t *testing.T) {
	p := &GeminiProvider{}
	if p.Capabilities()&ai.CapabilityChat == 0 {
		t.Error("Capabilities() must advertise CapabilityChat")
	}
}

func TestGeminiProvider_BuildContents_MapsAssistantToModel(t *testing.T) {
	p := &GeminiProvider{}

	contents := p.buildContents(&ai.ChatRequest{
		Prompt: "current question",
		History: []ai.ChatMessage{
			{Role: "system", Content: "system note"},
			{Role: "user", Content: "old question"},
			{Role: "assistant", Content: "old answer"},
		},
	})

	if len(contents) != 3 {
		t.Fatalf("expected 3 contents (system history skipped), got %d: %v", len(contents), contents)
	}
	if contents[1]["role"] != "model" {
		t.Errorf("assistant history should map to role %q, got %v", "model", contents[1]["role"])
	}
	if contents[2]["role"] != "user" {
		t.Errorf("last content should be the current user prompt, got %v", contents[2]["role"])
	}
}
