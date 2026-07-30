//go:build !windows

package agent

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type chatHelperProvider struct {
	name      string
	available bool
}

func (p *chatHelperProvider) Name() string                     { return p.name }
func (p *chatHelperProvider) DisplayName() string              { return p.name }
func (p *chatHelperProvider) Description() string              { return p.name }
func (p *chatHelperProvider) Provider() string                 { return "mock" }
func (p *chatHelperProvider) IsAvailable() bool                { return p.available }
func (p *chatHelperProvider) Capabilities() ProviderCapability { return CapabilityChat }
func (p *chatHelperProvider) Chat(context.Context, *ChatRequest) (*ChatResponse, error) {
	return &ChatResponse{}, nil
}
func (p *chatHelperProvider) StreamChat(context.Context, *ChatRequest, func(string)) (*ChatResponse, error) {
	return &ChatResponse{}, nil
}

func newChatHelperRegistry(providers ...AIProvider) *Registry {
	r := &Registry{providers: make(map[string]AIProvider)}
	for _, provider := range providers {
		r.providers[provider.Name()] = provider
		if r.defaultAgent == "" && provider.IsAvailable() {
			r.defaultAgent = provider.Name()
		}
	}
	return r
}

func TestNormalizeMessageRole(t *testing.T) {
	tests := []struct {
		name string
		role string
		want string
	}{
		{name: "preserves user", role: "user", want: "user"},
		{name: "preserves assistant", role: "assistant", want: "assistant"},
		{name: "normalizes system to user", role: "system", want: "user"},
		{name: "normalizes human to user", role: "human", want: "user"},
		{name: "normalizes bot to user", role: "bot", want: "user"},
		{name: "normalizes empty to user", role: "", want: "user"},
		{name: "normalizes mixed case to user", role: "Assistant", want: "user"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, normalizeMessageRole(tt.role))
		})
	}
}

func TestTotalChatPromptChars(t *testing.T) {
	tests := []struct {
		name string
		req  protocol.ChatRequest
		want int
	}{
		{
			name: "prompt only",
			req:  protocol.ChatRequest{Prompt: "hello"},
			want: len("hello"),
		},
		{
			name: "prompt and history",
			req: protocol.ChatRequest{
				Prompt:  "hello",
				History: []protocol.ChatMessage{{Role: "user", Content: "hi"}, {Role: "assistant", Content: "there"}},
			},
			want: len("hello") + len("hi") + len("there"),
		},
		{
			name: "empty content still counted correctly",
			req: protocol.ChatRequest{
				Prompt:  "a",
				History: []protocol.ChatMessage{{Role: "user", Content: ""}, {Role: "assistant", Content: "bc"}},
			},
			want: 3,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, totalChatPromptChars(tt.req))
		})
	}
}

func TestValidateChatPromptSizeBoundaries(t *testing.T) {
	tests := []struct {
		name      string
		req       protocol.ChatRequest
		wantError string
	}{
		{
			name: "accepts combined size at limit",
			req: protocol.ChatRequest{
				Prompt:  strings.Repeat("a", maxPromptChars-2),
				History: []protocol.ChatMessage{{Role: "user", Content: "bc"}},
			},
		},
		{
			name: "rejects combined size over limit",
			req: protocol.ChatRequest{
				Prompt:  strings.Repeat("a", maxPromptChars-1),
				History: []protocol.ChatMessage{{Role: "assistant", Content: "bc"}},
			},
			wantError: fmt.Sprintf("Prompt exceeds maximum combined prompt/history length of %d characters", maxPromptChars),
		},
		{
			name: "rejects prompt only over limit",
			req: protocol.ChatRequest{
				Prompt: strings.Repeat("a", maxPromptChars+1),
			},
			wantError: fmt.Sprintf("Prompt exceeds maximum combined prompt/history length of %d characters", maxPromptChars),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := validateChatPromptSize(tt.req)
			if tt.wantError == "" {
				require.NoError(t, err)
				return
			}
			require.EqualError(t, err, tt.wantError)
		})
	}
}

func TestClassifyProviderError(t *testing.T) {
	tests := []struct {
		name        string
		err         error
		wantCode    string
		wantMessage string
	}{
		{
			name:        "authentication status code is case insensitive",
			err:         errors.New("provider returned STATUS 401 from upstream"),
			wantCode:    "authentication_error",
			wantMessage: "Failed to authenticate with AI provider - check your API key",
		},
		{
			name:        "authentication token expiry",
			err:         errors.New("OAuth token has expired"),
			wantCode:    "authentication_error",
			wantMessage: "Failed to authenticate with AI provider - check your API key",
		},
		{
			name:        "rate limit status code",
			err:         errors.New("request failed with status 429"),
			wantCode:    "rate_limit",
			wantMessage: "Rate limit exceeded - please wait and try again",
		},
		{
			name:        "rate limit resource exhausted",
			err:         errors.New("RESOURCE_EXHAUSTED while calling model"),
			wantCode:    "rate_limit",
			wantMessage: "Rate limit exceeded - please wait and try again",
		},
		{
			name:        "falls back to execution error",
			err:         errors.New("connection reset by peer"),
			wantCode:    "execution_error",
			wantMessage: "Failed to get response from AI provider",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			code, message := classifyProviderError(tt.err)
			assert.Equal(t, tt.wantCode, code)
			assert.Equal(t, tt.wantMessage, message)
		})
	}
}

func TestServer_HasConfiguredAIProviderStates(t *testing.T) {
	tests := []struct {
		name   string
		server *Server
		want   bool
	}{
		{name: "nil server", server: nil, want: false},
		{name: "nil registry", server: &Server{}, want: false},
		{name: "empty registry", server: &Server{registry: newChatHelperRegistry()}, want: false},
		{
			name:   "unavailable provider only",
			server: &Server{registry: newChatHelperRegistry(&chatHelperProvider{name: "mock", available: false})},
			want:   false,
		},
		{
			name:   "available provider present",
			server: &Server{registry: newChatHelperRegistry(&chatHelperProvider{name: "mock", available: true})},
			want:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.server.hasConfiguredAIProvider())
		})
	}
}

func TestServer_ErrorResponseChatHelpers(t *testing.T) {
	resp := (&Server{}).errorResponse("msg-123", "prompt_too_large", "too many characters")

	require.Equal(t, "msg-123", resp.ID)
	require.Equal(t, protocol.TypeError, resp.Type)

	payload, ok := resp.Payload.(protocol.ErrorPayload)
	require.True(t, ok)
	assert.Equal(t, "prompt_too_large", payload.Code)
	assert.Equal(t, "too many characters", payload.Message)
}

