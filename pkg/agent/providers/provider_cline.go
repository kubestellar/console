package providers

import (
	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// ClineProvider implements the ai.Provider interface for Cline
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
	return c.cliDetected || config.GetConfigManager().IsKeyAvailable("cline")
}
func (c *ClineProvider) Capabilities() ai.ProviderCapability { return ai.CapabilityChat }

func (c *ClineProvider) Chat(ctx context.Context, req *ai.ChatRequest) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("cline") {
		return &ai.ChatResponse{Content: "Cline is detected but no API key is configured. Set CLINE_API_KEY to enable chat.", Agent: c.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "cline", "https://api.cline.bot/v1/chat/completions", c.Name())
}

func (c *ClineProvider) StreamChat(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string)) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("cline") {
		msg := "Cline is detected but no API key is configured. Set CLINE_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ai.ChatResponse{Content: msg, Agent: c.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "cline", "https://api.cline.bot/v1/chat/completions", c.Name(), onChunk)
}
