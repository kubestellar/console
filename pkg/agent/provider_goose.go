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
)

// GooseProvider implements the AIProvider interface for Goose CLI by Block, Inc.
type GooseProvider struct {
	cliPath string
	version string
}

func NewGooseProvider() *GooseProvider {
	p := &GooseProvider{}
	p.detectCLI()
	return p
}

func (g *GooseProvider) detectCLI() {
	// Check PATH first
	if path, err := exec.LookPath("goose"); err == nil {
		g.cliPath = path
		g.detectVersion()
		return
	}

	// Check common installation paths
	home, err := os.UserHomeDir()
	paths := []string{}
	if err == nil && home != "" {
		paths = append(paths,
			filepath.Join(home, ".local", "bin", "goose"),
			filepath.Join(home, ".goose", "bin", "goose"),
		)
	}
	paths = append(paths, "/usr/local/bin/goose")

	// Homebrew paths (macOS)
	for _, prefix := range []string{"/opt/homebrew", "/usr/local"} {
		paths = append(paths, filepath.Join(prefix, "bin", "goose"))
	}

	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			g.cliPath = p
			g.detectVersion()
			return
		}
	}
}

func (g *GooseProvider) detectVersion() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, g.cliPath, "--version").Output()
	if err == nil {
		g.version = strings.TrimSpace(string(out))
	}
}

func (g *GooseProvider) Name() string        { return "goose" }
func (g *GooseProvider) DisplayName() string { return "Goose" }
func (g *GooseProvider) Provider() string    { return "block" }
func (g *GooseProvider) Description() string {
	if g.version != "" {
		return fmt.Sprintf("Goose (%s) - open-source AI agent by Block with MCP support", g.version)
	}
	return "Goose - open-source AI agent by Block with MCP support"
}
func (g *GooseProvider) IsAvailable() bool {
	return g.cliPath != ""
}
func (g *GooseProvider) Capabilities() ProviderCapability {
	return CapabilityChat | CapabilityToolExec
}

func (g *GooseProvider) Refresh() {
	g.detectCLI()
}

func (g *GooseProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
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

func (g *GooseProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if g.cliPath == "" {
		return nil, fmt.Errorf("goose CLI not found")
	}

	prompt := buildPromptWithHistoryGeneric(req)

	execCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	// goose run -t "prompt" -q --no-session
	// -q: quiet mode, suppress non-response output
	// --no-session: don't persist session state
	cmd := exec.CommandContext(execCtx, g.cliPath, "run", "-t", prompt, "-q", "--no-session")
	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start goose: %w", err)
	}

	// Drain stderr in background to prevent pipe-buffer deadlocks.
	var stderrBuf strings.Builder
	stderrDone := make(chan struct{})
	go func() {
		defer close(stderrDone)
		if _, copyErr := io.Copy(&stderrBuf, stderr); copyErr != nil {
			slog.Error(fmt.Sprintf("[Goose] Error reading stderr: %v", copyErr))
		}
	}()

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
		slog.Error(fmt.Sprintf("[Goose] Scanner error: %v", scanErr))
	}

	// Wait for stderr drain before calling cmd.Wait.
	<-stderrDone

	if waitErr := cmd.Wait(); waitErr != nil {
		if fullResponse.Len() == 0 {
			stderrStr := strings.TrimSpace(stderrBuf.String())
			if stderrStr != "" {
				return nil, fmt.Errorf("goose exited with error: %w; stderr: %s", waitErr, stderrStr)
			}
			return nil, fmt.Errorf("goose exited with error: %w", waitErr)
		}
		slog.Error(fmt.Sprintf("[Goose] Command finished with error: %v", waitErr))
	}

	return &ChatResponse{
		Content: fullResponse.String(),
		Agent:   g.Name(),
		Done:    true,
	}, nil
}
