package providers

import (
	"crypto/tls"
	"math"
	"net/http"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/prompts"
	"github.com/kubestellar/console/pkg/ai"
)

// expectedTokensForRoughLengthDivisor mirrors estimatedCharsPerToken in the
// non-test code; we keep an independent constant here so a typo in the
// production constant would actually fail this test rather than be masked
// by reusing the same symbol from the same file.
const expectedTokensForRoughLengthDivisor = 4

// TestEstimateTokensFromText covers the happy-path heuristic and the
// edge cases that broke the navbar indicator in #9160 (empty content from
// a CLI that exits cleanly with no output, single-character prompts).
func TestEstimateTokensFromText(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want int
	}{
		{name: "empty", in: "", want: 0},
		{name: "single char", in: "a", want: 1},
		{name: "exact 4", in: "abcd", want: 1},
		{name: "five chars", in: "abcde", want: 2}, // ceil(5/4) = 2
		{name: "eight chars", in: "12345678", want: 2},
		{name: "long english", in: strings.Repeat("hello world ", 10), want: (12*10 + expectedTokensForRoughLengthDivisor - 1) / expectedTokensForRoughLengthDivisor},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := estimateTokensFromText(tc.in)
			if got != tc.want {
				t.Fatalf("estimateTokensFromText(%q) = %d, want %d", tc.in, got, tc.want)
			}
		})
	}
}

// TestEstimateChatTokenUsage_NilRequest exercises the defensive nil-request
// branch — without it a CLI provider that surfaces an error after building
// the response could nil-deref.
func TestEstimateChatTokenUsage_NilRequest(t *testing.T) {
	got := estimateChatTokenUsage(nil, "abcd")
	if got == nil {
		t.Fatal("expected non-nil ai.ProviderTokenUsage for nil request")
	}
	if got.InputTokens != 0 {
		t.Errorf("InputTokens = %d, want 0 (no request to count)", got.InputTokens)
	}
	if got.OutputTokens != 1 {
		t.Errorf("OutputTokens = %d, want 1 (4 chars / 4)", got.OutputTokens)
	}
	if got.TotalTokens != 1 {
		t.Errorf("TotalTokens = %d, want 1", got.TotalTokens)
	}
}

// TestEstimateChatTokenUsage_PromptAndResponse verifies that input tokens
// reflect the rendered prompt+history string (so a long history shows up in
// the indicator even on the first reply).
func TestEstimateChatTokenUsage_PromptAndResponse(t *testing.T) {
	req := &ai.ChatRequest{
		Prompt: "list pods",
		History: []ai.ChatMessage{
			{Role: "user", Content: "what does kubectl do?"},
			{Role: "assistant", Content: "It is a Kubernetes CLI."},
		},
		SystemPrompt: "You are a Kubernetes assistant.",
	}
	got := estimateChatTokenUsage(req, "Pods are running.")
	if got == nil {
		t.Fatal("expected non-nil ai.ProviderTokenUsage")
	}
	if got.InputTokens <= 0 {
		t.Errorf("InputTokens = %d, want > 0 (prompt+history+system are non-empty)", got.InputTokens)
	}
	if got.OutputTokens <= 0 {
		t.Errorf("OutputTokens = %d, want > 0 (response is non-empty)", got.OutputTokens)
	}
	if got.TotalTokens != got.InputTokens+got.OutputTokens {
		t.Errorf("TotalTokens = %d, want InputTokens(%d)+OutputTokens(%d)=%d",
			got.TotalTokens, got.InputTokens, got.OutputTokens, got.InputTokens+got.OutputTokens)
	}
}

// TestEstimateChatTokenUsage_EmptyResponse simulates a CLI that returns no
// content (e.g. immediate failure). Input tokens should still be attributed
// because the user's prompt did consume budget on the way to the model.
func TestEstimateChatTokenUsage_EmptyResponse(t *testing.T) {
	req := &ai.ChatRequest{Prompt: "list pods"}
	got := estimateChatTokenUsage(req, "")
	if got == nil {
		t.Fatal("expected non-nil ai.ProviderTokenUsage")
	}
	if got.OutputTokens != 0 {
		t.Errorf("OutputTokens = %d, want 0 (empty response)", got.OutputTokens)
	}
	if got.InputTokens <= 0 {
		t.Errorf("InputTokens = %d, want > 0 (prompt is non-empty)", got.InputTokens)
	}
}

func TestBuildPromptWithHistoryGeneric_IncludesExplicitNegativeConstraints(t *testing.T) {
	req := &ai.ChatRequest{
		Prompt: "Do not open the desktop app. Stay in the terminal and run kind create cluster --name demo.",
	}

	prompt := buildPromptWithHistoryGeneric(req)
	if !strings.Contains(prompt, "CRITICAL USER CONSTRAINTS") {
		t.Fatal("expected explicit negative constraints block in prompt")
	}
	if !strings.Contains(strings.ToLower(prompt), "do not open the desktop app") {
		t.Fatal("expected desktop-app prohibition to be preserved in prompt")
	}
	if !strings.Contains(strings.ToLower(prompt), "stay in the terminal") {
		t.Fatal("expected terminal-only constraint to be preserved in prompt")
	}
}

func TestRequestForbidsDesktopCompanion(t *testing.T) {
	req := &ai.ChatRequest{Prompt: "Don't open the desktop app. Terminal only."}
	if !requestForbidsDesktopCompanion(req) {
		t.Fatal("expected desktop companion restriction to be detected")
	}
}

func TestSafeProviderPreallocationSize(t *testing.T) {
	cases := []struct {
		name  string
		base  int
		extra int
		want  int
	}{
		{name: "adds small values", base: 3, extra: 2, want: 5},
		{name: "zero extra", base: 4, extra: 0, want: 4},
		{name: "rejects negative base", base: -1, extra: 1, want: 0},
		{name: "rejects negative extra", base: 1, extra: -1, want: 0},
		{name: "rejects overflow", base: math.MaxInt, extra: 1, want: 0},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := safeProviderPreallocationSize(tc.base, tc.extra); got != tc.want {
				t.Fatalf("safeProviderPreallocationSize(%d, %d) = %d, want %d", tc.base, tc.extra, got, tc.want)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// cloneTLSConfig — TLS minimum version enforcement
// ---------------------------------------------------------------------------

func TestCloneTLSConfig(t *testing.T) {
	t.Run("nil base returns config with TLS 1.2 minimum", func(t *testing.T) {
		cfg := cloneTLSConfig(nil)
		if cfg == nil {
			t.Fatal("expected non-nil config")
		}
		if cfg.MinVersion != tls.VersionTLS12 {
			t.Errorf("MinVersion = %d, want %d (TLS 1.2)", cfg.MinVersion, tls.VersionTLS12)
		}
	})

	t.Run("base with zero MinVersion gets TLS 1.2", func(t *testing.T) {
		base := &tls.Config{}
		cfg := cloneTLSConfig(base)
		if cfg.MinVersion != tls.VersionTLS12 {
			t.Errorf("MinVersion = %d, want %d (TLS 1.2)", cfg.MinVersion, tls.VersionTLS12)
		}
	})

	t.Run("base with TLS 1.3 preserved", func(t *testing.T) {
		base := &tls.Config{MinVersion: tls.VersionTLS13}
		cfg := cloneTLSConfig(base)
		if cfg.MinVersion != tls.VersionTLS13 {
			t.Errorf("MinVersion = %d, want %d (TLS 1.3)", cfg.MinVersion, tls.VersionTLS13)
		}
	})

	t.Run("clone does not mutate original", func(t *testing.T) {
		base := &tls.Config{
			ServerName: "example.com",
			MinVersion: tls.VersionTLS12,
		}
		cloned := cloneTLSConfig(base)
		cloned.ServerName = "changed.com"
		if base.ServerName != "example.com" {
			t.Error("original config was mutated by clone")
		}
	})
}

// ---------------------------------------------------------------------------
// preventAIProviderRedirects — SSRF redirect mitigation
// ---------------------------------------------------------------------------

func TestPreventAIProviderRedirects(t *testing.T) {
	err := preventAIProviderRedirects(nil, nil)
	if err != http.ErrUseLastResponse {
		t.Errorf("got %v, want http.ErrUseLastResponse to block redirects", err)
	}
}

// ---------------------------------------------------------------------------
// collectExplicitNegativeConstraints — comprehensive edge cases
// ---------------------------------------------------------------------------

func TestCollectExplicitNegativeConstraints(t *testing.T) {
	t.Run("nil request returns nil", func(t *testing.T) {
		got := collectExplicitNegativeConstraints(nil)
		if got != nil {
			t.Errorf("expected nil, got %v", got)
		}
	})

	t.Run("no constraints yields empty slice", func(t *testing.T) {
		req := &ai.ChatRequest{Prompt: "list all pods in the default namespace"}
		got := collectExplicitNegativeConstraints(req)
		if len(got) != 0 {
			t.Errorf("expected empty slice, got %v", got)
		}
	})

	t.Run("detects do-not-open-desktop", func(t *testing.T) {
		req := &ai.ChatRequest{Prompt: "do not open any desktop app, just use the terminal"}
		got := collectExplicitNegativeConstraints(req)
		if len(got) == 0 {
			t.Fatal("expected at least one constraint")
		}
		found := false
		for _, c := range got {
			if strings.Contains(strings.ToLower(c), "desktop") {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("expected constraint about 'desktop', got %v", got)
		}
	})

	t.Run("detects don't-open-gui", func(t *testing.T) {
		req := &ai.ChatRequest{Prompt: "don't open any gui application"}
		got := collectExplicitNegativeConstraints(req)
		if len(got) == 0 {
			t.Fatal("expected constraint about gui")
		}
	})

	t.Run("detects terminal-only", func(t *testing.T) {
		req := &ai.ChatRequest{Prompt: "terminal only please"}
		got := collectExplicitNegativeConstraints(req)
		if len(got) == 0 {
			t.Fatal("expected constraint about terminal")
		}
	})

	t.Run("extracts from user history only", func(t *testing.T) {
		req := &ai.ChatRequest{
			Prompt: "now list pods",
			History: []ai.ChatMessage{
				{Role: "user", Content: "do not open any desktop app"},
				{Role: "assistant", Content: "do not open desktop app"},
			},
		}
		got := collectExplicitNegativeConstraints(req)
		if len(got) == 0 {
			t.Fatal("expected constraint from user history")
		}
	})

	t.Run("assistant-only history yields no constraints", func(t *testing.T) {
		req := &ai.ChatRequest{
			Prompt: "hello",
			History: []ai.ChatMessage{
				{Role: "assistant", Content: "do not open desktop app"},
			},
		}
		got := collectExplicitNegativeConstraints(req)
		if len(got) != 0 {
			t.Errorf("assistant messages should not produce constraints, got %v", got)
		}
	})

	t.Run("duplicates are deduplicated", func(t *testing.T) {
		req := &ai.ChatRequest{
			Prompt: "do not open desktop app. Also, do not open desktop app.",
		}
		got := collectExplicitNegativeConstraints(req)
		if len(got) != 1 {
			t.Errorf("expected 1 deduplicated constraint, got %d: %v", len(got), got)
		}
	})
}

// ---------------------------------------------------------------------------
// buildExplicitNegativeConstraintBlock — formatting
// ---------------------------------------------------------------------------

func TestBuildExplicitNegativeConstraintBlock(t *testing.T) {
	t.Run("empty when no constraints", func(t *testing.T) {
		req := &ai.ChatRequest{Prompt: "list pods"}
		result := buildExplicitNegativeConstraintBlock(req)
		if result != "" {
			t.Errorf("expected empty string, got %q", result)
		}
	})

	t.Run("nil request returns empty", func(t *testing.T) {
		result := buildExplicitNegativeConstraintBlock(nil)
		if result != "" {
			t.Errorf("expected empty string, got %q", result)
		}
	})

	t.Run("contains header and bullet points", func(t *testing.T) {
		req := &ai.ChatRequest{Prompt: "do not open any desktop app"}
		result := buildExplicitNegativeConstraintBlock(req)
		if !strings.Contains(result, "CRITICAL USER CONSTRAINTS:") {
			t.Error("expected CRITICAL USER CONSTRAINTS header")
		}
		if !strings.Contains(result, "- ") {
			t.Error("expected bullet-point format")
		}
		if !strings.Contains(result, "hard requirements") {
			t.Error("expected enforcement reminder text")
		}
	})
}

// ---------------------------------------------------------------------------
// requestForbidsDesktopCompanion — additional cases
// ---------------------------------------------------------------------------

func TestRequestForbidsDesktopCompanion_EdgeCases(t *testing.T) {
	t.Run("returns false for normal request", func(t *testing.T) {
		req := &ai.ChatRequest{Prompt: "list pods"}
		if requestForbidsDesktopCompanion(req) {
			t.Error("normal request should not forbid desktop")
		}
	})

	t.Run("returns false for nil request", func(t *testing.T) {
		if requestForbidsDesktopCompanion(nil) {
			t.Error("nil request should not forbid desktop")
		}
	})
}

// ---------------------------------------------------------------------------
// buildPromptWithHistoryGeneric — role labels and default system prompt
// ---------------------------------------------------------------------------

func TestBuildPromptWithHistoryGeneric_RoleLabels(t *testing.T) {
	req := &ai.ChatRequest{
		Prompt:       "final question",
		SystemPrompt: "test-system",
		History: []ai.ChatMessage{
			{Role: "user", Content: "user msg"},
			{Role: "assistant", Content: "assistant msg"},
			{Role: "system", Content: "system note"},
			{Role: "tool", Content: "tool output"},
		},
	}
	result := buildPromptWithHistoryGeneric(req)

	if !strings.Contains(result, "User: user msg") {
		t.Error("expected 'User: user msg' in prompt")
	}
	if !strings.Contains(result, "Assistant: assistant msg") {
		t.Error("expected 'Assistant: assistant msg' in prompt")
	}
	if !strings.Contains(result, "System: system note") {
		t.Error("expected 'System: system note' in prompt")
	}
	if !strings.Contains(result, "Unknown: tool output") {
		t.Error("expected 'Unknown: tool output' for unrecognized role")
	}
	if !strings.HasSuffix(result, "User: final question") {
		t.Error("prompt should end with 'User: final question'")
	}
}

func TestBuildPromptWithHistoryGeneric_DefaultSystemPrompt(t *testing.T) {
	req := &ai.ChatRequest{Prompt: "hello"}
	result := buildPromptWithHistoryGeneric(req)
	if !strings.Contains(result, prompts.DefaultSystemPrompt) {
		t.Error("empty SystemPrompt should use DefaultSystemPrompt")
	}
}

func TestBuildPromptWithHistoryGeneric_NoConstraintBlock(t *testing.T) {
	req := &ai.ChatRequest{
		Prompt:       "list pods",
		SystemPrompt: "sys",
	}
	result := buildPromptWithHistoryGeneric(req)
	if strings.Contains(result, "CRITICAL USER CONSTRAINTS") {
		t.Error("normal prompt should not have constraint block")
	}
}

// ---------------------------------------------------------------------------
// estimateChatTokenUsage — history increases input tokens
// ---------------------------------------------------------------------------

func TestEstimateChatTokenUsage_HistoryIncreasesInputTokens(t *testing.T) {
	reqNoHistory := &ai.ChatRequest{
		Prompt:       "list pods",
		SystemPrompt: "assistant",
	}
	reqWithHistory := &ai.ChatRequest{
		Prompt:       "list pods",
		SystemPrompt: "assistant",
		History: []ai.ChatMessage{
			{Role: "user", Content: "hello"},
			{Role: "assistant", Content: "hi there, how can I help?"},
		},
	}
	usageNoHist := estimateChatTokenUsage(reqNoHistory, "ok")
	usageWithHist := estimateChatTokenUsage(reqWithHistory, "ok")
	if usageWithHist.InputTokens <= usageNoHist.InputTokens {
		t.Errorf("history should increase input tokens: without=%d, with=%d",
			usageNoHist.InputTokens, usageWithHist.InputTokens)
	}
	if usageNoHist.OutputTokens != usageWithHist.OutputTokens {
		t.Errorf("same response should have same output tokens: without=%d, with=%d",
			usageNoHist.OutputTokens, usageWithHist.OutputTokens)
	}
}
