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

// GHCopilotProvider implements the AIProvider interface for GitHub Copilot CLI
type GHCopilotProvider struct {
	ghPath          string
	copilotAvailable bool
}

func NewGHCopilotProvider() *GHCopilotProvider {
	p := &GHCopilotProvider{}
	p.detectCLI()
	return p
}

func (g *GHCopilotProvider) detectCLI() {
	ghPath, err := exec.LookPath("gh")
	if err != nil {
		return
	}
	g.ghPath = ghPath

	// Check if copilot extension is installed
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, ghPath, "extension", "list").Output()
	if err == nil && strings.Contains(string(out), "copilot") {
		g.copilotAvailable = true
	}
}

func (g *GHCopilotProvider) Name() string        { return "gh-copilot" }
func (g *GHCopilotProvider) DisplayName() string { return "GitHub Copilot Agents" }
func (g *GHCopilotProvider) Provider() string    { return "github" }
func (g *GHCopilotProvider) Description() string {
	return "GitHub Copilot CLI - AI-powered coding assistance via gh copilot"
}
func (g *GHCopilotProvider) IsAvailable() bool {
	return g.ghPath != "" && g.copilotAvailable
}
func (g *GHCopilotProvider) Capabilities() ProviderCapability {
	return CapabilityChat | CapabilityToolExec
}

func (g *GHCopilotProvider) Refresh() {
	g.detectCLI()
}

func (g *GHCopilotProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
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

func (g *GHCopilotProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if g.ghPath == "" || !g.copilotAvailable {
		return nil, fmt.Errorf("gh copilot not available")
	}

	prompt := buildPromptWithHistoryGeneric(req)

	execCtx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(execCtx, g.ghPath, "copilot", "explain", prompt)
	cmd.Env = append(os.Environ(), "NO_COLOR=1")

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start gh copilot: %w", err)
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
		log.Printf("[GHCopilot] Command finished with error: %v", err)
	}

	return &ChatResponse{
		Content: fullResponse.String(),
		Agent:   g.Name(),
		Done:    true,
	}, nil
}
