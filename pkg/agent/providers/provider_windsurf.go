package providers

import (
	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
	"context"
	"os"
	"os/exec"
	"runtime"
)

// WindsurfProvider implements the ai.Provider interface for Windsurf (Codeium)
type WindsurfProvider struct {
	appDetected bool
}

func NewWindsurfProvider() *WindsurfProvider {
	p := &WindsurfProvider{}
	p.detectApp()
	return p
}

func (w *WindsurfProvider) detectApp() {
	if _, err := exec.LookPath("windsurf"); err == nil {
		w.appDetected = true
		return
	}
	switch runtime.GOOS {
	case "darwin":
		if _, err := os.Stat("/Applications/Windsurf.app"); err == nil {
			w.appDetected = true
		}
	case "windows":
		home, _ := os.UserHomeDir()
		if _, err := os.Stat(home + "\\AppData\\Local\\Programs\\windsurf\\Windsurf.exe"); err == nil {
			w.appDetected = true
		}
	case "linux":
		if _, err := os.Stat("/usr/bin/windsurf"); err == nil {
			w.appDetected = true
		}
	}
}

func (w *WindsurfProvider) Name() string        { return "windsurf" }
func (w *WindsurfProvider) DisplayName() string { return "Windsurf" }
func (w *WindsurfProvider) Provider() string    { return "codeium" }
func (w *WindsurfProvider) Description() string {
	return "Windsurf IDE by Codeium - AI-powered code editor"
}
func (w *WindsurfProvider) IsAvailable() bool {
	return w.appDetected || config.GetConfigManager().IsKeyAvailable("windsurf")
}
func (w *WindsurfProvider) Capabilities() ai.ProviderCapability { return ai.CapabilityChat }

func (w *WindsurfProvider) Chat(ctx context.Context, req *ai.ChatRequest) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("windsurf") {
		return &ai.ChatResponse{Content: "Windsurf is detected but no API key is configured. Set CODEIUM_API_KEY to enable chat.", Agent: w.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "windsurf", "https://api.codeium.com/v1/chat/completions", w.Name())
}

func (w *WindsurfProvider) StreamChat(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string)) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("windsurf") {
		msg := "Windsurf is detected but no API key is configured. Set CODEIUM_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ai.ChatResponse{Content: msg, Agent: w.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "windsurf", "https://api.codeium.com/v1/chat/completions", w.Name(), onChunk)
}
