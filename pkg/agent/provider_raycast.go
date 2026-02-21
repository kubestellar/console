package agent

import (
	"context"
	"fmt"
	"os"
	"runtime"
)

// RaycastProvider implements the AIProvider interface for Raycast
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
	return r.appDetected || GetConfigManager().IsKeyAvailable("raycast")
}
func (r *RaycastProvider) Capabilities() ProviderCapability { return CapabilityChat }

func (r *RaycastProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("raycast") {
		return &ChatResponse{Content: fmt.Sprintf("Raycast is detected but no API key is configured. Set RAYCAST_API_KEY to enable chat."), Agent: r.Name(), Done: true}, nil
	}
	return chatViaOpenAICompatible(ctx, req, "raycast", "https://api.raycast.com/v1/chat/completions", r.Name())
}

func (r *RaycastProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if !GetConfigManager().HasAPIKey("raycast") {
		msg := "Raycast is detected but no API key is configured. Set RAYCAST_API_KEY to enable chat."
		if onChunk != nil { onChunk(msg) }
		return &ChatResponse{Content: msg, Agent: r.Name(), Done: true}, nil
	}
	return streamViaOpenAICompatible(ctx, req, "raycast", "https://api.raycast.com/v1/chat/completions", r.Name(), onChunk)
}
