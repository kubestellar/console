package providers

import (
	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
	"context"
	"os"
	"os/exec"
	"runtime"
)

// CursorProvider implements the ai.Provider interface for Cursor IDE
type CursorProvider struct {
	appDetected bool
}

func NewCursorProvider() *CursorProvider {
	p := &CursorProvider{}
	p.detectApp()
	return p
}

func (c *CursorProvider) detectApp() {
	if _, err := exec.LookPath("cursor"); err == nil {
		c.appDetected = true
		return
	}
	switch runtime.GOOS {
	case "darwin":
		if _, err := os.Stat("/Applications/Cursor.app"); err == nil {
			c.appDetected = true
		}
	case "windows":
		home, _ := os.UserHomeDir()
		if _, err := os.Stat(home + "\\AppData\\Local\\Programs\\cursor\\Cursor.exe"); err == nil {
			c.appDetected = true
		}
	case "linux":
		if _, err := os.Stat("/usr/bin/cursor"); err == nil {
			c.appDetected = true
		}
	}
}

func (c *CursorProvider) Name() string        { return "cursor" }
func (c *CursorProvider) DisplayName() string { return "Cursor" }
func (c *CursorProvider) Provider() string    { return "anysphere" }
func (c *CursorProvider) Description() string {
	return "Cursor IDE by Anysphere - AI-first code editor"
}

func (c *CursorProvider) IsAvailable() bool {
	return c.appDetected || config.GetConfigManager().IsKeyAvailable("cursor")
}

func (c *CursorProvider) Capabilities() ai.ProviderCapability {
	return ai.CapabilityChat
}

func (c *CursorProvider) Chat(ctx context.Context, req *ai.ChatRequest) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("cursor") {
		return &ai.ChatResponse{
			Content: "Cursor is detected but no API key is configured. Set CURSOR_API_KEY to enable chat via Cursor's API.",
			Agent:   c.Name(),
			Done:    true,
		}, nil
	}
	// Use OpenAI-compatible API with Cursor's endpoint
	return chatViaOpenAICompatible(ctx, req, "cursor", "https://api.cursor.com/v1/chat/completions", c.Name())
}

func (c *CursorProvider) StreamChat(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string)) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("cursor") {
		msg := "Cursor is detected but no API key is configured. Set CURSOR_API_KEY to enable chat."
		if onChunk != nil {
			onChunk(msg)
		}
		return &ai.ChatResponse{Content: msg, Agent: c.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "cursor", "https://api.cursor.com/v1/chat/completions", c.Name(), onChunk)
}
