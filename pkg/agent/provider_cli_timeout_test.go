package agent

import (
	"context"
	"os/exec"
	"strings"
	"testing"
	"time"
)

func fakeProviderCLICommandContext(ctx context.Context, _ string, _ ...string) *exec.Cmd {
	// Use a non-login shell (-c, not -lc) to avoid sourcing /etc/profile and
	// ~/.bash_profile which can add seconds of latency on some CI runners.
	// Use python3 explicitly; the bare "python" symlink is absent on many modern distros.
	const stderrFloodCommand = `printf 'cluster summary ready\n'; python3 -c "import sys; sys.stderr.write('tool progress: inspecting cluster contexts\n' * 20000)"`
	return exec.CommandContext(ctx, "bash", "-c", stderrFloodCommand)
}

func TestCodexProvider_StreamChatDrainsStderr(t *testing.T) {
	defer func() { execCommandContext = exec.CommandContext }()
	execCommandContext = fakeProviderCLICommandContext

	provider := &CodexProvider{cliPath: "codex"}
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	resp, err := provider.StreamChat(ctx, &ChatRequest{Prompt: "tell me about my clusters"}, nil)
	if err != nil {
		t.Fatalf("StreamChat returned error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected response")
	}
	if !strings.Contains(resp.Content, "cluster summary ready") {
		t.Fatalf("expected stdout content, got %q", resp.Content)
	}
}

func TestGeminiCLIProvider_StreamChatDrainsStderr(t *testing.T) {
	defer func() { execCommandContext = exec.CommandContext }()
	execCommandContext = fakeProviderCLICommandContext

	provider := &GeminiCLIProvider{cliPath: "gemini"}
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()

	resp, err := provider.StreamChat(ctx, &ChatRequest{Prompt: "tell me about my clusters"}, nil)
	if err != nil {
		t.Fatalf("StreamChat returned error: %v", err)
	}
	if resp == nil {
		t.Fatal("expected response")
	}
	if !strings.Contains(resp.Content, "cluster summary ready") {
		t.Fatalf("expected stdout content, got %q", resp.Content)
	}
}
