package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ClineProvider implements the AIProvider interface for Cline
type ClineProvider struct {
	cliDetected bool
}

func NewClineProvider() *ClineProvider {
	p := &ClineProvider{}
	p.detectCLI()
	return p
}

func (c *ClineProvider) detectCLI() {
	if _, err := exec.LookPath("cline"); err == nil {
		c.cliDetected = true
		return
	}
	// Check VS Code extensions for Cline
	home, _ := os.UserHomeDir()
	extDir := filepath.Join(home, ".vscode", "extensions")
	entries, err := os.ReadDir(extDir)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() && (strings.HasPrefix(e.Name(), "saoudrizwan.claude-dev") || strings.HasPrefix(e.Name(), "cline.cline")) {
				c.cliDetected = true
				return
			}
		}
	}
}

func (c *ClineProvider) Name() string        { return "cline" }
func (c *ClineProvider) DisplayName() string { return "Cline" }
func (c *ClineProvider) Provider() string    { return "cline" }
func (c *ClineProvider) Description() string {
	return "Cline - autonomous AI coding agent for VS Code"
}
func (c *ClineProvider) IsAvailable() bool {
	return c.cliDetected || GetConfigManager().IsKeyAvailable("cline")
}
func (c *ClineProvider) Capabilities() ProviderCapability { return CapabilityChat }

func (c *ClineProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("cline") {
		return &ChatResponse{Content: fmt.Sprintf("Cline is detected but no API key is configured. Set CLINE_API_KEY to enable chat."), Agent: c.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "cline", "https://api.cline.bot/v1/chat/completions", c.Name())
}

func (c *ClineProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("cline") {
		msg := "Cline is detected but no API key is configured. Set CLINE_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ChatResponse{Content: msg, Agent: c.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "cline", "https://api.cline.bot/v1/chat/completions", c.Name(), onChunk)
}
