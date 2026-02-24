package agent

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

// CopilotCLIProvider implements the AIProvider interface for GitHub Copilot CLI
type CopilotCLIProvider struct {
	cliPath string
	version string
}

func NewCopilotCLIProvider() *CopilotCLIProvider {
	p := &CopilotCLIProvider{}
	p.detectCLI()
	return p
}

func (c *CopilotCLIProvider) detectCLI() {
	if path, err := exec.LookPath("copilot"); err == nil {
		c.cliPath = path
		c.detectVersion()
		return
	}

	// Check common installation paths
	paths := []string{
		"/usr/local/bin/copilot",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			c.cliPath = p
			c.detectVersion()
			return
		}
	}
}

func (c *CopilotCLIProvider) detectVersion() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, c.cliPath, "--version").Output()
	if err == nil {
		ver := strings.TrimSpace(string(out))
		// Output is like "GitHub Copilot CLI 0.0.414."
		ver = strings.TrimPrefix(ver, "GitHub Copilot CLI ")
		ver = strings.TrimSuffix(ver, ".")
		// Drop the "Run 'copilot update'..." line
		if idx := strings.Index(ver, "\n"); idx > 0 {
			ver = ver[:idx]
		}
		c.version = strings.TrimSpace(ver)
	}
}

func (c *CopilotCLIProvider) Name() string        { return "copilot-cli" }
func (c *CopilotCLIProvider) DisplayName() string { return "Copilot CLI" }
func (c *CopilotCLIProvider) Provider() string    { return "github-cli" }
func (c *CopilotCLIProvider) Description() string {
	if c.version != "" {
		return fmt.Sprintf("GitHub Copilot CLI (v%s) - AI-powered terminal assistant by GitHub", c.version)
	}
	return "GitHub Copilot CLI - AI-powered terminal assistant by GitHub"
}
func (c *CopilotCLIProvider) IsAvailable() bool {
	return c.cliPath != ""
}
func (c *CopilotCLIProvider) Capabilities() ProviderCapability {
	return CapabilityChat | CapabilityToolExec
}

func (c *CopilotCLIProvider) Refresh() {
	c.detectCLI()
}

func (c *CopilotCLIProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
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

func (c *CopilotCLIProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if c.cliPath == "" {
		return nil, fmt.Errorf("copilot CLI not found")
	}

	prompt := buildPromptWithHistoryGeneric(req)

	execCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(execCtx, c.cliPath, "-p", prompt)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start copilot CLI: %w", err)
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
		log.Printf("[CopilotCLI] Command finished with error: %v", err)
	}

	return &ChatResponse{
		Content: fullResponse.String(),
		Agent:   c.Name(),
		Done:    true,
	}, nil
}
