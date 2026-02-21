package agent

import (
	"context"
	"fmt"
	"os"
)

// OpenWebUIProvider implements the AIProvider interface for Open WebUI
type OpenWebUIProvider struct {
	baseURL string
}

func NewOpenWebUIProvider() *OpenWebUIProvider {
	p := &OpenWebUIProvider{}
	if url := os.Getenv("OPEN_WEBUI_URL"); url != "" {
		p.baseURL = url
	}
	return p
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
	if o.baseURL != "" {
		return o.baseURL + "/api/chat/completions"
	}
	if url := os.Getenv("OPEN_WEBUI_URL"); url != "" {
		return url + "/api/chat/completions"
	}
	return ""
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
