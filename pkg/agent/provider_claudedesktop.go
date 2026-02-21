package agent

import (
	"context"
	"fmt"
	"os"
	"runtime"
)

// ClaudeDesktopProvider implements the AIProvider interface for Claude Desktop app
type ClaudeDesktopProvider struct {
	appDetected bool
}

func NewClaudeDesktopProvider() *ClaudeDesktopProvider {
	p := &ClaudeDesktopProvider{}
	p.detectApp()
	return p
}

func (c *ClaudeDesktopProvider) detectApp() {
	switch runtime.GOOS {
	case "darwin":
		if _, err := os.Stat("/Applications/Claude.app"); err == nil {
			c.appDetected = true
		}
	case "windows":
		home, _ := os.UserHomeDir()
		if _, err := os.Stat(home + "\\AppData\\Local\\Programs\\claude-desktop\\Claude.exe"); err == nil {
			c.appDetected = true
		}
	case "linux":
		if _, err := os.Stat("/usr/bin/claude-desktop"); err == nil {
			c.appDetected = true
		}
	}
}

func (c *ClaudeDesktopProvider) Name() string        { return "claude-desktop" }
func (c *ClaudeDesktopProvider) DisplayName() string { return "Claude Desktop" }
func (c *ClaudeDesktopProvider) Provider() string    { return "anthropic" }
func (c *ClaudeDesktopProvider) Description() string {
	return "Claude Desktop app by Anthropic - stdio-based AI assistant"
}

func (c *ClaudeDesktopProvider) IsAvailable() bool {
	return c.appDetected || GetConfigManager().IsKeyAvailable("claude-desktop")
}

func (c *ClaudeDesktopProvider) Capabilities() ProviderCapability {
	return CapabilityChat
}

func (c *ClaudeDesktopProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	// Route through Anthropic API if key available
	cm := GetConfigManager()
	apiKey := cm.GetAPIKey("claude-desktop")
	if apiKey == "" {
		apiKey = cm.GetAPIKey("claude")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("Claude Desktop detected but no API key configured (set CLAUDE_DESKTOP_API_KEY or ANTHROPIC_API_KEY)")
	}

	// Delegate to Claude API provider with the available key
	claude := NewClaudeProvider()
	return claude.Chat(ctx, req)
}

func (c *ClaudeDesktopProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	cm := GetConfigManager()
	apiKey := cm.GetAPIKey("claude-desktop")
	if apiKey == "" {
		apiKey = cm.GetAPIKey("claude")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("Claude Desktop detected but no API key configured (set CLAUDE_DESKTOP_API_KEY or ANTHROPIC_API_KEY)")
	}

	claude := NewClaudeProvider()
	return claude.StreamChat(ctx, req, onChunk)
}
