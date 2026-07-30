//go:build !windows

package agent

import (
	"testing"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDecodeOptionalString(t *testing.T) {
	tests := []struct {
		name      string
		value     any
		want      string
		wantValid bool
	}{
		{name: "nil is allowed", value: nil, want: "", wantValid: true},
		{name: "string value", value: "hello", want: "hello", wantValid: true},
		{name: "empty string", value: "", want: "", wantValid: true},
		{name: "wrong type", value: 42, want: "", wantValid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := decodeOptionalString(tt.value)
			assert.Equal(t, tt.wantValid, ok)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestDecodeOptionalBool(t *testing.T) {
	tests := []struct {
		name      string
		value     any
		want      bool
		wantValid bool
	}{
		{name: "nil is allowed", value: nil, want: false, wantValid: true},
		{name: "true value", value: true, want: true, wantValid: true},
		{name: "false value", value: false, want: false, wantValid: true},
		{name: "wrong type", value: "true", want: false, wantValid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := decodeOptionalBool(tt.value)
			assert.Equal(t, tt.wantValid, ok)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestDecodeChatHistory(t *testing.T) {
	tests := []struct {
		name      string
		value     any
		want      []protocol.ChatMessage
		wantValid bool
	}{
		{name: "nil history", value: nil, want: nil, wantValid: true},
		{
			name:      "typed history is normalized",
			value:     []protocol.ChatMessage{{Role: "assistant", Content: "ok"}, {Role: "system", Content: "ignored"}},
			want:      []protocol.ChatMessage{{Role: "assistant", Content: "ok"}, {Role: "user", Content: "ignored"}},
			wantValid: true,
		},
		{
			name: "slice of any supports maps and typed messages",
			value: []any{
				map[string]any{"role": "bot", "content": "first"},
				protocol.ChatMessage{Role: "assistant", Content: "second"},
			},
			want:      []protocol.ChatMessage{{Role: "user", Content: "first"}, {Role: "assistant", Content: "second"}},
			wantValid: true,
		},
		{name: "map missing content", value: []any{map[string]any{"role": "user"}}, wantValid: false},
		{name: "unsupported item type", value: []any{123}, wantValid: false},
		{name: "unsupported history type", value: map[string]any{"role": "user"}, wantValid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := decodeChatHistory(tt.value)
			assert.Equal(t, tt.wantValid, ok)
			if !tt.wantValid {
				assert.Nil(t, got)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestDecodeChatRequestPayload(t *testing.T) {
	tests := []struct {
		name      string
		payload   any
		want      protocol.ChatRequest
		wantValid bool
	}{
		{
			name:      "chat request value",
			payload:   protocol.ChatRequest{Prompt: "hello", SessionID: "s1"},
			want:      protocol.ChatRequest{Prompt: "hello", SessionID: "s1"},
			wantValid: true,
		},
		{
			name:      "chat request pointer",
			payload:   &protocol.ChatRequest{Prompt: "hello", Agent: "mock"},
			want:      protocol.ChatRequest{Prompt: "hello", Agent: "mock"},
			wantValid: true,
		},
		{name: "nil chat request pointer", payload: (*protocol.ChatRequest)(nil), wantValid: false},
		{
			name:      "claude request value",
			payload:   protocol.ClaudeRequest{Prompt: "legacy", SessionID: "legacy-session"},
			want:      protocol.ChatRequest{Prompt: "legacy", SessionID: "legacy-session"},
			wantValid: true,
		},
		{
			name:      "claude request pointer",
			payload:   &protocol.ClaudeRequest{Prompt: "legacy", SessionID: "legacy-session"},
			want:      protocol.ChatRequest{Prompt: "legacy", SessionID: "legacy-session"},
			wantValid: true,
		},
		{name: "nil claude request pointer", payload: (*protocol.ClaudeRequest)(nil), wantValid: false},
		{
			name: "map payload decodes optional fields",
			payload: map[string]any{
				"prompt":         "hello",
				"agent":          "mock",
				"sessionId":      "s1",
				"clusterContext": "kind-dev",
				"dryRun":         true,
				"history": []any{
					map[string]any{"role": "system", "content": "first"},
					protocol.ChatMessage{Role: "assistant", Content: "second"},
				},
			},
			want: protocol.ChatRequest{
				Prompt:         "hello",
				Agent:          "mock",
				SessionID:      "s1",
				ClusterContext: "kind-dev",
				DryRun:         true,
				History:        []protocol.ChatMessage{{Role: "user", Content: "first"}, {Role: "assistant", Content: "second"}},
			},
			wantValid: true,
		},
		{
			name: "map payload allows omitted optional fields",
			payload: map[string]any{
				"prompt": "hello",
			},
			want:      protocol.ChatRequest{Prompt: "hello"},
			wantValid: true,
		},
		{name: "invalid prompt type", payload: map[string]any{"prompt": 123}, wantValid: false},
		{name: "invalid dryRun type", payload: map[string]any{"prompt": "hello", "dryRun": "true"}, wantValid: false},
		{name: "invalid history type", payload: map[string]any{"prompt": "hello", "history": map[string]any{}}, wantValid: false},
		{name: "unsupported payload type", payload: 123, wantValid: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := decodeChatRequestPayload(tt.payload)
			assert.Equal(t, tt.wantValid, ok)
			if !tt.wantValid {
				assert.Equal(t, protocol.ChatRequest{}, got)
				return
			}
			require.Equal(t, tt.want, got)
		})
	}
}
