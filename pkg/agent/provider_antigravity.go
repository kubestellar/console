package agent

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// AntigravityProvider implements the AIProvider interface for Google Antigravity CLI
type AntigravityProvider struct {
	cliPath string
	version string
}

func NewAntigravityProvider() *AntigravityProvider {
	p := &AntigravityProvider{}
	p.detectCLI()
	return p
}

func (a *AntigravityProvider) detectCLI() {
	if path, err := exec.LookPath("antigravity"); err == nil {
		a.cliPath = path
		a.detectVersion()
		return
	}

	home, _ := os.UserHomeDir()
	paths := []string{
		filepath.Join(home, ".local", "bin", "antigravity"),
		filepath.Join(home, ".npm-global", "bin", "antigravity"),
		"/usr/local/bin/antigravity",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			a.cliPath = p
			a.detectVersion()
			return
		}
	}
}

func (a *AntigravityProvider) detectVersion() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, a.cliPath, "--version").Output()
	if err == nil {
		a.version = strings.TrimSpace(string(out))
	}
}

func (a *AntigravityProvider) Name() string        { return "antigravity" }
func (a *AntigravityProvider) DisplayName() string { return "Antigravity" }
func (a *AntigravityProvider) Provider() string    { return "google-ag" }
func (a *AntigravityProvider) Description() string {
	if a.version != "" {
		return fmt.Sprintf("Google Antigravity (v%s) - AI coding agent with tool execution", a.version)
	}
	return "Google Antigravity - AI coding agent with tool execution"
}
func (a *AntigravityProvider) IsAvailable() bool {
	return a.cliPath != ""
}
func (a *AntigravityProvider) Capabilities() ProviderCapability {
	// Antigravity is a VS Code-based IDE, not a standalone CLI agent.
	// It cannot run commands headlessly via -p flag like Claude Code or Copilot CLI.
	return CapabilityChat
}

func (a *AntigravityProvider) Refresh() {
	a.detectCLI()
}

// Handshake verifies that the Antigravity CLI is installed and can respond.
// It returns a structured result with prerequisites and actionable errors.
func (a *AntigravityProvider) Handshake(ctx context.Context) *HandshakeResult {
	// Re-detect CLI in case the user installed it after the server started.
	a.detectCLI()

	if a.cliPath == "" {
		return &HandshakeResult{
			Ready:   false,
			State:   "failed",
			Message: "Antigravity CLI not found. Install it to use this provider.",
			Prerequisites: []string{
				"Install the Antigravity CLI (npm install -g @anthropic-ai/antigravity or download from the project page)",
				"Ensure the 'antigravity' binary is in your PATH",
				"Restart kc-agent after installing",
			},
		}
	}

	// Run --version with a short timeout to verify the CLI responds.
	checkCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	out, err := exec.CommandContext(checkCtx, a.cliPath, "--version").CombinedOutput()
	if err != nil {
		slog.Error(fmt.Sprintf("[Antigravity] Handshake failed: %v (output: %s)", err, string(out)))
		return &HandshakeResult{
			Ready:   false,
			State:   "failed",
			Message: fmt.Sprintf("Antigravity CLI found at %s but failed to respond: %v", a.cliPath, err),
			CliPath: a.cliPath,
			Prerequisites: []string{
				"Verify that the Antigravity CLI works by running: antigravity --version",
				"Check that any required authentication or bridge service is running",
				"Try reinstalling the CLI if the binary is corrupted",
			},
		}
	}

	version := strings.TrimSpace(string(out))
	a.version = version

	return &HandshakeResult{
		Ready:   true,
		State:   "connected",
		Message: fmt.Sprintf("Antigravity CLI v%s is ready", version),
		Version: version,
		CliPath: a.cliPath,
	}
}

func (a *AntigravityProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	var result strings.Builder
	resp, err := a.StreamChat(ctx, req, func(chunk string) {
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

func (a *AntigravityProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if a.cliPath == "" {
		return nil, fmt.Errorf("antigravity CLI not found")
	}

	prompt := buildPromptWithHistoryGeneric(req)

	execCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(execCtx, a.cliPath, "-p", prompt)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start antigravity: %w", err)
	}

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

	if err := cmd.Wait(); err != nil {
		slog.Error(fmt.Sprintf("[Antigravity] Command finished with error: %v", err))
	}

	return &ChatResponse{
		Content: fullResponse.String(),
		Agent:   a.Name(),
		Done:    true,
	}, nil
}
