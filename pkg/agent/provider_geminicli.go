package agent

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/safego"
)

// GeminiCLIProvider implements the AIProvider interface for Google Gemini CLI
type GeminiCLIProvider struct {
	cliPath string
	version string
}

func NewGeminiCLIProvider() *GeminiCLIProvider {
	p := &GeminiCLIProvider{}
	p.detectCLI()
	return p
}

func (g *GeminiCLIProvider) detectCLI() {
	if path, err := exec.LookPath("gemini"); err == nil {
		g.cliPath = path
		g.detectVersion()
		return
	}

	home, _ := os.UserHomeDir()
	paths := []string{
		filepath.Join(home, ".local", "bin", "gemini"),
		filepath.Join(home, ".npm-global", "bin", "gemini"),
		"/usr/local/bin/gemini",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			g.cliPath = p
			g.detectVersion()
			return
		}
	}
}

func (g *GeminiCLIProvider) detectVersion() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, g.cliPath, "--version").Output()
	if err == nil {
		g.version = strings.TrimSpace(string(out))
	}
}

func (g *GeminiCLIProvider) Name() string        { return "gemini-cli" }
func (g *GeminiCLIProvider) DisplayName() string { return "Gemini CLI" }
func (g *GeminiCLIProvider) Provider() string    { return "google-cli" }
func (g *GeminiCLIProvider) Description() string {
	if g.version != "" {
		return fmt.Sprintf("Google Gemini CLI (v%s) - AI agent with tool execution", g.version)
	}
	return "Google Gemini CLI - AI agent with tool execution"
}
func (g *GeminiCLIProvider) IsAvailable() bool {
	return g.cliPath != ""
}
func (g *GeminiCLIProvider) Capabilities() ProviderCapability {
	return CapabilityChat | CapabilityToolExec
}

func (g *GeminiCLIProvider) Refresh() {
	g.detectCLI()
}

func (g *GeminiCLIProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	var result strings.Builder
	resp, err := g.StreamChat(ctx, req, func(chunk string) {
		result.WriteString(chunk)
	})
	if err != nil {
		return nil, err
	}
	if resp.Content == "" {
		resp.Content = result.String()
	}
	return resp, nil
}

func (g *GeminiCLIProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if g.cliPath == "" {
		return nil, fmt.Errorf("gemini CLI not found")
	}

	toolStatus := CheckToolDependencies()
	toolAwareReq := withToolAvailabilityContext(req, toolStatus)
	prompt := buildPromptWithHistoryGeneric(toolAwareReq)

	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, cliProviderExecutionTimeout)
		defer cancel()
	}

	cmd := execCommandContext(ctx, g.cliPath, "-p", prompt, "--approval-mode=yolo")
	cmd.Env = append(os.Environ(), "NO_COLOR=1")
	configureProcessGroup(cmd) // #9442: kill entire process tree on timeout

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start gemini: %w", err)
	}

	var stderrBuf strings.Builder
	stderrDone := make(chan struct{})
	safego.GoWith("gemini-cli-stream", func() {
		defer close(stderrDone)
		if _, copyErr := io.Copy(&stderrBuf, stderr); copyErr != nil {
			slog.Error("[GeminiCLI] error reading stderr", "error", copyErr)
		}
	})

	var fullResponse strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		fullResponse.WriteString(line)
		fullResponse.WriteString("\n")
		if onChunk != nil {
			onChunk(line + "\n")
		}
	}

	if scanErr := scanner.Err(); scanErr != nil {
		slog.Error("[GeminiCLI] scanner error reading stdout", "error", scanErr)
	}

	<-stderrDone

	if waitErr := cmd.Wait(); waitErr != nil {
		if fullResponse.Len() == 0 {
			stderrStr := strings.TrimSpace(stderrBuf.String())
			if stderrStr != "" {
				return nil, fmt.Errorf("gemini exited with error: %w; stderr: %s", waitErr, stderrStr)
			}
			return nil, fmt.Errorf("gemini exited with error: %w", waitErr)
		}
		slog.Error("[GeminiCLI] command finished with error", "error", waitErr)
	}

	content := fullResponse.String()
	return &ChatResponse{
		Content: content,
		Agent:   g.Name(),
		Done:    true,
		// Gemini CLI does not emit token usage in its stdout, so we estimate
		// from the input prompt and the captured output. Without this the
		// navbar token-usage indicator stays at 0 for the entire session
		// (#9160), which breaks budget visibility for Gemini CLI users.
		// (The HTTP-API GeminiProvider already returns exact counts via
		// `usageMetadata` and is unaffected.)
		TokenUsage: estimateChatTokenUsage(req, content),
	}, nil
}
