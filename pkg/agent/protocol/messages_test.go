package protocol

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type messageEnvelope struct {
	ID      string          `json:"id"`
	Type    MessageType     `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

func decodePayload[T any](t *testing.T, raw []byte) T {
	t.Helper()

	var got T
	require.NoError(t, json.Unmarshal(raw, &got))
	return got
}

func TestMessageMarshalRoundTrip(t *testing.T) {
	msg := Message{
		ID:   "msg-1",
		Type: TypeHealth,
		Payload: HealthPayload{
			Status:    "ok",
			Version:   "1.2.3",
			OS:        "linux",
			Arch:      "amd64",
			Clusters:  2,
			HasClaude: true,
			Claude: &ClaudeInfo{
				Installed: true,
				Path:      "/usr/bin/claude",
				Version:   "0.9.0",
				TokenUsage: TokenUsage{
					Session:   TokenCount{Input: 11, Output: 7},
					Today:     TokenCount{Input: 100, Output: 50},
					ThisMonth: TokenCount{Input: 1000, Output: 500},
				},
			},
			AvailableProviders: []ProviderSummary{{Name: "claude", DisplayName: "Claude", Capabilities: 3}},
		},
	}

	data, err := json.Marshal(msg)
	require.NoError(t, err)

	var envelope messageEnvelope
	require.NoError(t, json.Unmarshal(data, &envelope))
	assert.Equal(t, msg.ID, envelope.ID)
	assert.Equal(t, msg.Type, envelope.Type)

	gotPayload := decodePayload[HealthPayload](t, envelope.Payload)
	assert.Equal(t, msg.Payload, gotPayload)
}

func TestPayloadMarshalRoundTrip(t *testing.T) {
	tests := []struct {
		name    string
		payload any
		assert  func(t *testing.T, raw []byte)
	}{
		{
			name: "clusters payload preserves contexts",
			payload: ClustersPayload{
				Clusters: []ClusterInfo{{
					Name:       "cluster-a",
					Context:    "cluster-a-admin",
					Server:     "https://cluster-a.example.com",
					User:       "alice",
					Namespace:  "team-a",
					AuthMethod: "exec",
					IsCurrent:  true,
				}},
				Current: "cluster-a-admin",
			},
			assert: func(t *testing.T, raw []byte) {
				t.Helper()
				got := decodePayload[ClustersPayload](t, raw)
				assert.Equal(t, ClustersPayload{
					Clusters: []ClusterInfo{{
						Name:       "cluster-a",
						Context:    "cluster-a-admin",
						Server:     "https://cluster-a.example.com",
						User:       "alice",
						Namespace:  "team-a",
						AuthMethod: "exec",
						IsCurrent:  true,
					}},
					Current: "cluster-a-admin",
				}, got)
			},
		},
		{
			name: "chat request preserves history and dry run state",
			payload: ChatRequest{
				Agent:          "kagenti",
				Prompt:         "summarize pod health",
				SessionID:      "session-7",
				History:        []ChatMessage{{Role: "user", Content: "hello"}, {Role: "assistant", Content: "hi"}},
				ClusterContext: "prod-cluster",
				DryRun:         true,
			},
			assert: func(t *testing.T, raw []byte) {
				t.Helper()
				got := decodePayload[ChatRequest](t, raw)
				assert.Equal(t, ChatRequest{
					Agent:          "kagenti",
					Prompt:         "summarize pod health",
					SessionID:      "session-7",
					History:        []ChatMessage{{Role: "user", Content: "hello"}, {Role: "assistant", Content: "hi"}},
					ClusterContext: "prod-cluster",
					DryRun:         true,
				}, got)
			},
		},
		{
			name: "state digest preserves versions map",
			payload: StateDigestPayload{
				Sequence:  42,
				Timestamp: 1700000000,
				Versions: map[string]string{
					"pods":        "981",
					"deployments": "144",
				},
			},
			assert: func(t *testing.T, raw []byte) {
				t.Helper()
				got := decodePayload[StateDigestPayload](t, raw)
				assert.Equal(t, StateDigestPayload{
					Sequence:  42,
					Timestamp: 1700000000,
					Versions: map[string]string{
						"pods":        "981",
						"deployments": "144",
					},
				}, got)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := json.Marshal(tt.payload)
			require.NoError(t, err)
			tt.assert(t, raw)
		})
	}
}

func TestPayloadOmitsEmptyOptionalFields(t *testing.T) {
	tests := []struct {
		name      string
		payload   any
		fieldName string
	}{
		{
			name: "kubectl request omits optional fields",
			payload: KubectlRequest{
				Args: []string{"get", "pods"},
			},
			fieldName: "context",
		},
		{
			name: "chat stream payload omits usage when nil",
			payload: ChatStreamPayload{
				Content:   "chunk",
				Agent:     "claude",
				SessionID: "session-1",
				Done:      false,
			},
			fieldName: "usage",
		},
		{
			name: "provider check omits prerequisites when empty",
			payload: ProviderCheckResponse{
				Provider:     "claude",
				Ready:        true,
				State:        "connected",
				Message:      "ready",
				HasHandshake: true,
			},
			fieldName: "prerequisites",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			raw, err := json.Marshal(tt.payload)
			require.NoError(t, err)

			var got map[string]any
			require.NoError(t, json.Unmarshal(raw, &got))
			assert.NotContains(t, got, tt.fieldName)
		})
	}
}

func TestPayloadUnmarshalErrors(t *testing.T) {
	tests := []struct {
		name   string
		raw    string
		target any
	}{
		{
			name:   "kubectl request rejects non array args",
			raw:    `{"args":"get pods"}`,
			target: &KubectlRequest{},
		},
		{
			name:   "chat request rejects malformed history entries",
			raw:    `{"prompt":"hello","history":[1]}`,
			target: &ChatRequest{},
		},
		{
			name:   "state digest rejects non object versions",
			raw:    `{"seq":1,"ts":2,"versions":["bad"]}`,
			target: &StateDigestPayload{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := json.Unmarshal([]byte(tt.raw), tt.target)
			require.Error(t, err)
		})
	}
}
