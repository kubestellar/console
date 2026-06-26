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

// ContinueProvider implements the ai.Provider interface for Continue.dev
type ContinueProvider struct {
	extensionDetected bool
}

func NewContinueProvider() *ContinueProvider {
	p := &ContinueProvider{}
	p.detectExtension()
	return p
}

func (c *ContinueProvider) detectExtension() {
	if _, err := exec.LookPath("continue"); err == nil {
		c.extensionDetected = true
		return
	}
	// Check VS Code extensions for Continue
	home, _ := os.UserHomeDir()
	extDir := filepath.Join(home, ".vscode", "extensions")
	entries, err := os.ReadDir(extDir)
	if err == nil {
		for _, e := range entries {
			if e.IsDir() && strings.HasPrefix(e.Name(), "continue.continue") {
				c.extensionDetected = true
				return
			}
		}
	}
	// Check Continue config exists
	if _, err := os.Stat(filepath.Join(home, ".continue", "config.json")); err == nil {
		c.extensionDetected = true
	}
}

func (c *ContinueProvider) Name() string        { return "continue" }
func (c *ContinueProvider) DisplayName() string { return "Continue" }
func (c *ContinueProvider) Provider() string    { return "continue" }
func (c *ContinueProvider) Description() string {
	return "Continue.dev - open-source AI code assistant"
}
func (c *ContinueProvider) IsAvailable() bool {
	return c.extensionDetected || config.GetConfigManager().IsKeyAvailable("continue")
}
func (c *ContinueProvider) Capabilities() ai.ProviderCapability { return ai.CapabilityChat }

func (c *ContinueProvider) Chat(ctx context.Context, req *ai.ChatRequest) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("continue") {
		return &ai.ChatResponse{Content: "Continue is detected but no API key is configured. Set CONTINUE_API_KEY to enable chat.", Agent: c.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "continue", "https://api.continue.dev/v1/chat/completions", c.Name())
}

func (c *ContinueProvider) StreamChat(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string)) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("continue") {
		msg := "Continue is detected but no API key is configured. Set CONTINUE_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ai.ChatResponse{Content: msg, Agent: c.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "continue", "https://api.continue.dev/v1/chat/completions", c.Name(), onChunk)
}
