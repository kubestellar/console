package agent

import (
	"context"
	"fmt"
	"os"
)

// OpenWebUIProvider implements the AIProvider interface for Open WebUI.
//
// Base URL is resolved dynamically via openWebUIResolveBaseURL() so changes
// to OPEN_WEBUI_URL or ~/.kc/config.yaml take effect without restarting.
type OpenWebUIProvider struct{}

func NewOpenWebUIProvider() *OpenWebUIProvider {
	return &OpenWebUIProvider{}
}

// openWebUIResolveBaseURL returns the effective base URL. Precedence:
// OPEN_WEBUI_URL env var → ~/.kc/config.yaml → empty (not configured).
func openWebUIResolveBaseURL() string {
	if v := os.Getenv("OPEN_WEBUI_URL"); v != "" {
		return v
	}
	if v := GetConfigManager().GetBaseURL("open-webui"); v != "" {
		return v
	}
	return ""
}

func (o *OpenWebUIProvider) Name() string        { return "open-webui" }
func (o *OpenWebUIProvider) DisplayName() string { return "Open WebUI" }
func (o *OpenWebUIProvider) Provider() string    { return "open-webui" }
func (o *OpenWebUIProvider) Description() string {
	return "Open WebUI - self-hosted AI chat interface (OpenAI-compatible)"
}

func (o *OpenWebUIProvider) IsAvailable() bool {
	return o.getEndpoint() != "" && GetConfigManager().IsKeyAvailable("open-webui")
}

func (o *OpenWebUIProvider) Capabilities() ProviderCapability { return CapabilityChat }

func (o *OpenWebUIProvider) getEndpoint() string {
	base := openWebUIResolveBaseURL()
	if base == "" {
		return ""
	}
	return base + "/api/chat/completions"
}

func (o *OpenWebUIProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	endpoint := o.getEndpoint()
	if endpoint == "" {
		return nil, fmt.Errorf("Open WebUI URL not configured (set OPEN_WEBUI_URL)")
	}
	return chatViaOpenAICompatible(ctx, req, "open-webui", endpoint, o.Name())
}

func (o *OpenWebUIProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	endpoint := o.getEndpoint()
	if endpoint == "" {
		return nil, fmt.Errorf("Open WebUI URL not configured (set OPEN_WEBUI_URL)")
	}
	return streamViaOpenAICompatible(ctx, req, "open-webui", endpoint, o.Name(), onChunk)
}
