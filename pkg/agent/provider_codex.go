package agent

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// CodexProvider implements the AIProvider interface for OpenAI Codex CLI
type CodexProvider struct {
	cliPath string
	version string
}

func NewCodexProvider() *CodexProvider {
	p := &CodexProvider{}
	p.detectCLI()
	return p
}

func (c *CodexProvider) detectCLI() {
	// Check PATH first
	if path, err := exec.LookPath("codex"); err == nil {
		c.cliPath = path
		c.detectVersion()
		return
	}

	// Check common installation paths
	home, _ := os.UserHomeDir()
	paths := []string{
		filepath.Join(home, ".local", "bin", "codex"),
		filepath.Join(home, ".npm-global", "bin", "codex"),
		"/usr/local/bin/codex",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			c.cliPath = p
			c.detectVersion()
			return
		}
	}
}

func (c *CodexProvider) detectVersion() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, c.cliPath, "--version").Output()
	if err == nil {
		c.version = strings.TrimSpace(string(out))
	}
}

func (c *CodexProvider) Name() string        { return "codex" }
func (c *CodexProvider) DisplayName() string { return "Codex" }
func (c *CodexProvider) Provider() string    { return "openai-cli" }
func (c *CodexProvider) Description() string {
	if c.version != "" {
		return fmt.Sprintf("OpenAI Codex CLI (v%s) - AI coding agent with tool execution", c.version)
	}
	return "OpenAI Codex CLI - AI coding agent with tool execution"
}
func (c *CodexProvider) IsAvailable() bool {
	return c.cliPath != ""
}
func (c *CodexProvider) Capabilities() ProviderCapability {
	return CapabilityChat | CapabilityToolExec
}

func (c *CodexProvider) Refresh() {
	c.detectCLI()
}

func (c *CodexProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	var result strings.Builder
	resp, err := c.StreamChat(ctx, req, func(chunk string) {
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

func (c *CodexProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if c.cliPath == "" {
		return nil, fmt.Errorf("codex CLI not found")
	}

	prompt := buildPromptWithHistoryGeneric(req)

	execCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(execCtx, c.cliPath, "--quiet", prompt)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start codex: %w", err)
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
		log.Printf("[Codex] Command finished with error: %v", err)
	}

	return &ChatResponse{
		Content: fullResponse.String(),
		Agent:   c.Name(),
		Done:    true,
	}, nil
}
