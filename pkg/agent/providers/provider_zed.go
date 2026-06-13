package providers

import (
	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
	"context"
	"os"
	"os/exec"
	"runtime"
)

// ZedProvider implements the ai.Provider interface for Zed editor
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
	return z.appDetected || config.GetConfigManager().IsKeyAvailable("zed")
}
func (z *ZedProvider) Capabilities() ai.ProviderCapability { return ai.CapabilityChat }

func (z *ZedProvider) Chat(ctx context.Context, req *ai.ChatRequest) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("zed") {
		return &ai.ChatResponse{Content: "Zed is detected but no API key is configured. Set ZED_API_KEY to enable chat.", Agent: z.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "zed", "https://api.zed.dev/v1/chat/completions", z.Name())
}

func (z *ZedProvider) StreamChat(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string)) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("zed") {
		msg := "Zed is detected but no API key is configured. Set ZED_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ai.ChatResponse{Content: msg, Agent: z.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "zed", "https://api.zed.dev/v1/chat/completions", z.Name(), onChunk)
}
