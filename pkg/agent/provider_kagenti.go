package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/kubestellar/console/pkg/kagenti_provider"
)

const (
	kagentiProviderHandshakeTimeout    = 2 * time.Second
	kagentiProviderAvailabilityTimeout = 1200 * time.Millisecond
	kagentiDefaultAgentNamespace       = "default"
)

// KagentiProvider implements AIProvider and StreamingProvider for Kagenti agents REST API.
type KagentiProvider struct {
	baseURL     string
	directAgent string
	agentName   string
	namespace   string
	client      *kagenti_provider.KagentiClient
}

var _ AIProvider = (*KagentiProvider)(nil)
var _ StreamingProvider = (*KagentiProvider)(nil)
var _ HandshakeProvider = (*KagentiProvider)(nil)

// NewKagentiProvider creates a new KagentiProvider and reuses kagenti_provider
// as the single source of truth for endpoint discovery and invocation.
func NewKagentiProvider() *KagentiProvider {
	client := kagenti_provider.NewKagentiClientFromEnv()
	p := &KagentiProvider{client: client}
	if client == nil {
		return p
	}

	p.baseURL = client.BaseURL()
	p.directAgent = client.DirectAgentURL()
	p.agentName = client.DirectAgentName()
	p.namespace = client.DirectAgentNamespace()
	if p.namespace == "" && p.directAgent != "" {
		p.namespace = kagentiDefaultAgentNamespace
	}

	ctx, cancel := context.WithTimeout(context.Background(), kagentiProviderHandshakeTimeout)
	defer cancel()
	p.findDefaultAgent(ctx)

	return p
}

func (p *KagentiProvider) findDefaultAgent(ctx context.Context) {
	if p.client == nil {
		return
	}

	agents, err := p.client.ListAgentsWithContext(ctx)
	if err != nil || len(agents) == 0 {
		return
	}

	p.agentName = agents[0].Name
	p.namespace = agents[0].Namespace
	if p.namespace == "" {
		p.namespace = kagentiDefaultAgentNamespace
	}
}

func (p *KagentiProvider) Name() string {
	return "kagenti"
}

func (p *KagentiProvider) DisplayName() string {
	return "Kagenti (In-Cluster)"
}

func (p *KagentiProvider) Description() string {
	if p.directAgent != "" {
		if p.agentName != "" {
			return fmt.Sprintf("Cluster-native AI Agent (%s/%s @ %s)", p.namespace, p.agentName, p.directAgent)
		}
		return fmt.Sprintf("Cluster-native AI Agent (%s)", p.directAgent)
	}
	if p.agentName != "" {
		return fmt.Sprintf("Cluster-native AI Agent (%s/%s)", p.namespace, p.agentName)
	}
	return "Cluster-native AI Agent"
}

func (p *KagentiProvider) Provider() string {
	return "kagenti"
}

func (p *KagentiProvider) IsAvailable() bool {
	if p.client == nil {
		return false
	}

	if p.agentName != "" || p.namespace != "" {
		return true
	}

	ctx, cancel := context.WithTimeout(context.Background(), kagentiProviderAvailabilityTimeout)
	defer cancel()
	return p.controllerReachable(ctx)
}

func (p *KagentiProvider) Capabilities() ProviderCapability {
	return CapabilityChat | CapabilityToolExec
}

func (p *KagentiProvider) Handshake(ctx context.Context) *HandshakeResult {
	if p.client == nil {
		return &HandshakeResult{
			Ready:   false,
			State:   "failed",
			Message: "Kagenti controller URL is not configured. Set KAGENTI_CONTROLLER_URL or KAGENTI_AGENT_URL.",
		}
	}

	if !p.controllerReachable(ctx) {
		target := p.baseURL
		if p.directAgent != "" {
			target = p.directAgent
		}
		return &HandshakeResult{
			Ready:   false,
			State:   "failed",
			Message: fmt.Sprintf("Cannot reach Kagenti at %s", target),
		}
	}

	if p.agentName == "" {
		p.findDefaultAgent(ctx)
		if p.agentName == "" {
			return &HandshakeResult{
				Ready:   false,
				State:   "connected",
				Message: "Kagenti controller is reachable but no agents were found in the cluster.",
			}
		}
	}
	if p.namespace == "" {
		p.namespace = kagentiDefaultAgentNamespace
	}

	if p.directAgent != "" {
		return &HandshakeResult{
			Ready:   true,
			State:   "connected",
			Message: fmt.Sprintf("Connected to Kagenti agent at %s", p.directAgent),
		}
	}

	return &HandshakeResult{
		Ready:   true,
		State:   "connected",
		Message: fmt.Sprintf("Connected to Kagenti controller. Selected agent: %s/%s", p.namespace, p.agentName),
	}
}

func (p *KagentiProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	return p.StreamChatWithProgress(ctx, req, onChunk, nil)
}

func (p *KagentiProvider) StreamChatWithProgress(ctx context.Context, req *ChatRequest, onChunk func(chunk string), onProgress func(event StreamEvent)) (*ChatResponse, error) {
	if p.client == nil {
		return nil, fmt.Errorf("no kagenti endpoint is configured")
	}

	if p.agentName == "" {
		p.findDefaultAgent(ctx)
		if p.agentName == "" {
			return nil, fmt.Errorf("no kagenti agent is available")
		}
	}
	if p.namespace == "" {
		p.namespace = kagentiDefaultAgentNamespace
	}

	// Convert conversation history to the format expected by the kagenti client
	// so the agent receives full conversation context for follow-up messages (#11904).
	var history []kagenti_provider.HistoryMessage
	for _, m := range req.History {
		history = append(history, kagenti_provider.HistoryMessage{
			Role:    m.Role,
			Content: m.Content,
		})
	}

	stream, err := p.client.Invoke(ctx, p.namespace, p.agentName, req.Prompt, req.SessionID, history)
	if err != nil {
		return nil, err
	}
	defer stream.Close()

	reader := bufio.NewReader(stream)
	var fullContent strings.Builder

	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("error reading kagenti stream: %w", err)
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}

			var eventObj map[string]any
			if jsonErr := json.Unmarshal([]byte(data), &eventObj); jsonErr == nil {
				if t, ok := eventObj["type"].(string); ok && t != "" {
					if t == "text" || t == "message_delta" {
						if content, ok := eventObj["text"].(string); ok {
							fullContent.WriteString(content)
							if onChunk != nil {
								onChunk(content)
							}
						}
					} else if onProgress != nil {
						onProgress(StreamEvent{Type: t})
					}
				} else {
					if content, ok := eventObj["content"].(string); ok {
						fullContent.WriteString(content)
						if onChunk != nil {
							onChunk(content)
						}
					}
				}
			} else {
				fullContent.WriteString(data)
				if onChunk != nil {
					onChunk(data)
				}
			}
		}
	}

	return &ChatResponse{
		Content: fullContent.String(),
		Agent:   p.agentName,
		Done:    true,
	}, nil
}

func (p *KagentiProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	return p.StreamChat(ctx, req, nil)
}

func (p *KagentiProvider) controllerReachable(ctx context.Context) bool {
	if p.client == nil {
		return false
	}

	available, err := p.client.StatusWithContext(ctx)
	return err == nil && available
}
