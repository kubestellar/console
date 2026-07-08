package providers

import (
	"github.com/kubestellar/console/pkg/agent/config"
	"github.com/kubestellar/console/pkg/ai"
	"context"
	"os"
	"runtime"
)

// RaycastProvider implements the ai.Provider interface for Raycast
type RaycastProvider struct {
	appDetected bool
}

func NewRaycastProvider() *RaycastProvider {
	p := &RaycastProvider{}
	p.detectApp()
	return p
}

func (r *RaycastProvider) detectApp() {
	switch runtime.GOOS {
	case "darwin":
		if _, err := os.Stat("/Applications/Raycast.app"); err == nil {
			r.appDetected = true
		}
	}
}

func (r *RaycastProvider) Name() string        { return "raycast" }
func (r *RaycastProvider) DisplayName() string { return "Raycast" }
func (r *RaycastProvider) Provider() string    { return "raycast" }
func (r *RaycastProvider) Description() string {
	return "Raycast - AI-powered productivity launcher"
}
func (r *RaycastProvider) IsAvailable() bool {
	return r.appDetected || config.GetConfigManager().IsKeyAvailable("raycast")
}
func (r *RaycastProvider) Capabilities() ai.ProviderCapability { return ai.CapabilityChat }

func (r *RaycastProvider) Chat(ctx context.Context, req *ai.ChatRequest) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("raycast") {
		return &ai.ChatResponse{Content: "Raycast is detected but no API key is configured. Set RAYCAST_API_KEY to enable chat.", Agent: r.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "raycast", "https://api.raycast.com/v1/chat/completions", r.Name())
}

func (r *RaycastProvider) StreamChat(ctx context.Context, req *ai.ChatRequest, onChunk func(chunk string)) (*ai.ChatResponse, error) {
	if !config.GetConfigManager().HasAPIKey("raycast") {
		msg := "Raycast is detected but no API key is configured. Set RAYCAST_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ai.ChatResponse{Content: msg, Agent: r.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "raycast", "https://api.raycast.com/v1/chat/completions", r.Name(), onChunk)
}
