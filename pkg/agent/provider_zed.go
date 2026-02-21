package agent

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
)

// ZedProvider implements the AIProvider interface for Zed editor
type ZedProvider struct {
	appDetected bool
}

func NewZedProvider() *ZedProvider {
	p := &ZedProvider{}
	p.detectApp()
	return p
}

func (z *ZedProvider) detectApp() {
	if _, err := exec.LookPath("zed"); err == nil {
		z.appDetected = true
		return
	}
	switch runtime.GOOS {
	case "darwin":
		if _, err := os.Stat("/Applications/Zed.app"); err == nil {
			z.appDetected = true
		}
	case "linux":
		if _, err := os.Stat("/usr/bin/zed"); err == nil {
			z.appDetected = true
		}
	}
}

func (z *ZedProvider) Name() string        { return "zed" }
func (z *ZedProvider) DisplayName() string { return "Zed" }
func (z *ZedProvider) Provider() string    { return "zed" }
func (z *ZedProvider) Description() string {
	return "Zed editor by Zed Industries - high-performance AI code editor"
}
func (z *ZedProvider) IsAvailable() bool {
	return z.appDetected || GetConfigManager().IsKeyAvailable("zed")
}
func (z *ZedProvider) Capabilities() ProviderCapability { return CapabilityChat }

func (z *ZedProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("zed") {
		return &ChatResponse{Content: fmt.Sprintf("Zed is detected but no API key is configured. Set ZED_API_KEY to enable chat."), Agent: z.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "zed", "https://api.zed.dev/v1/chat/completions", z.Name())
}

func (z *ZedProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("zed") {
		msg := "Zed is detected but no API key is configured. Set ZED_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ChatResponse{Content: msg, Agent: z.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "zed", "https://api.zed.dev/v1/chat/completions", z.Name(), onChunk)
}
