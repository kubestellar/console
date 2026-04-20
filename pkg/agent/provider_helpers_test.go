package agent

import (
	"strings"
	"testing"
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
		t.Fatal("expected non-nil ProviderTokenUsage for nil request")
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
	req := &ChatRequest{
		Prompt: "list pods",
		History: []ChatMessage{
			{Role: "user", Content: "what does kubectl do?"},
			{Role: "assistant", Content: "It is a Kubernetes CLI."},
		},
		SystemPrompt: "You are a Kubernetes assistant.",
	}
	got := estimateChatTokenUsage(req, "Pods are running.")
	if got == nil {
		t.Fatal("expected non-nil ProviderTokenUsage")
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
	req := &ChatRequest{Prompt: "list pods"}
	got := estimateChatTokenUsage(req, "")
	if got == nil {
		t.Fatal("expected non-nil ProviderTokenUsage")
	}
	if got.OutputTokens != 0 {
		t.Errorf("OutputTokens = %d, want 0 (empty response)", got.OutputTokens)
	}
	if got.InputTokens <= 0 {
		t.Errorf("InputTokens = %d, want > 0 (prompt is non-empty)", got.InputTokens)
	}
}
