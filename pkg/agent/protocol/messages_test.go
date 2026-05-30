package protocol

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMessageMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name    string
		message Message
	}{
		{
			name: "health message with payload",
			message: Message{
				ID:   "msg-123",
				Type: TypeHealth,
				Payload: HealthPayload{
					Status:   "ok",
					Version:  "v1.0.0",
					OS:       "linux",
					Arch:     "amd64",
					Clusters: 3,
				},
			},
		},
		{
			name: "error message",
			message: Message{
				ID:   "err-456",
				Type: TypeError,
				Payload: ErrorPayload{
					Code:    "E001",
					Message: "something went wrong",
				},
			},
		},
		{
			name: "message without payload",
			message: Message{
				ID:   "simple-789",
				Type: TypeClusters,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.message)
			require.NoError(t, err)
			require.NotEmpty(t, data)

			var decoded Message
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.message.ID, decoded.ID)
			assert.Equal(t, tt.message.Type, decoded.Type)
		})
	}
}

func TestHealthPayloadMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name    string
		payload HealthPayload
	}{
		{
			name: "full health payload",
			payload: HealthPayload{
				Status:        "healthy",
				Version:       "v2.3.4",
				CommitSHA:     "abc123",
				BuildTime:     "2024-01-15T10:00:00Z",
				GoVersion:     "go1.21.5",
				OS:            "darwin",
				Arch:          "arm64",
				Clusters:      5,
				HasClaude:     true,
				InstallMethod: "brew",
				Claude: &ClaudeInfo{
					Installed: true,
					Path:      "/usr/local/bin/claude",
					Version:   "1.0.0",
					TokenUsage: TokenUsage{
						Session: TokenCount{Input: 100, Output: 50},
						Today:   TokenCount{Input: 500, Output: 300},
					},
				},
				AvailableProviders: []ProviderSummary{
					{Name: "claude", DisplayName: "Claude", Capabilities: 3},
					{Name: "openai", DisplayName: "OpenAI", Capabilities: 1},
				},
			},
		},
		{
			name: "minimal health payload",
			payload: HealthPayload{
				Status:   "ok",
				Version:  "dev",
				OS:       "linux",
				Arch:     "amd64",
				Clusters: 0,
			},
		},
		{
			name: "health payload with zero values",
			payload: HealthPayload{
				Status:     "",
				Version:    "",
				OS:         "",
				Arch:       "",
				Clusters:   0,
				HasClaude:  false,
				Claude:     nil,
				CommitSHA:  "",
				BuildTime:  "",
				GoVersion:  "",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.payload)
			require.NoError(t, err)

			var decoded HealthPayload
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.payload.Status, decoded.Status)
			assert.Equal(t, tt.payload.Version, decoded.Version)
			assert.Equal(t, tt.payload.Clusters, decoded.Clusters)
			assert.Equal(t, tt.payload.HasClaude, decoded.HasClaude)
		})
	}
}

func TestClustersPayloadMarshalUnmarshal(t *testing.T) {
	payload := ClustersPayload{
		Current: "prod-cluster",
		Clusters: []ClusterInfo{
			{
				Name:       "prod-cluster",
				Context:    "prod-ctx",
				Server:     "https://prod.example.com",
				User:       "admin",
				Namespace:  "default",
				AuthMethod: "certificate",
				IsCurrent:  true,
			},
			{
				Name:       "dev-cluster",
				Context:    "dev-ctx",
				Server:     "https://dev.example.com",
				AuthMethod: "token",
				IsCurrent:  false,
			},
		},
	}

	data, err := json.Marshal(payload)
	require.NoError(t, err)

	var decoded ClustersPayload
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, payload.Current, decoded.Current)
	assert.Len(t, decoded.Clusters, 2)
	assert.Equal(t, "prod-cluster", decoded.Clusters[0].Name)
	assert.True(t, decoded.Clusters[0].IsCurrent)
	assert.Equal(t, "dev-cluster", decoded.Clusters[1].Name)
	assert.False(t, decoded.Clusters[1].IsCurrent)
}

func TestKubectlRequestMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name    string
		request KubectlRequest
	}{
		{
			name: "simple kubectl get",
			request: KubectlRequest{
				Args: []string{"get", "pods"},
			},
		},
		{
			name: "kubectl with context and namespace",
			request: KubectlRequest{
				Context:   "prod",
				Namespace: "kube-system",
				Args:      []string{"get", "deployments"},
			},
		},
		{
			name: "destructive command with confirmation",
			request: KubectlRequest{
				Context:   "dev",
				Args:      []string{"delete", "pod", "test-pod"},
				Confirmed: true,
				SessionID: "session-123",
			},
		},
		{
			name: "empty args",
			request: KubectlRequest{
				Args: []string{},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.request)
			require.NoError(t, err)

			var decoded KubectlRequest
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.request.Context, decoded.Context)
			assert.Equal(t, tt.request.Namespace, decoded.Namespace)
			assert.Equal(t, tt.request.Args, decoded.Args)
			assert.Equal(t, tt.request.Confirmed, decoded.Confirmed)
			assert.Equal(t, tt.request.SessionID, decoded.SessionID)
		})
	}
}

func TestKubectlResponseMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name     string
		response KubectlResponse
	}{
		{
			name: "successful response",
			response: KubectlResponse{
				Output:   "pod/test-pod created",
				ExitCode: 0,
			},
		},
		{
			name: "error response",
			response: KubectlResponse{
				Output:   "",
				ExitCode: 1,
				Error:    "pod not found",
			},
		},
		{
			name: "requires confirmation",
			response: KubectlResponse{
				Output:               "",
				ExitCode:             0,
				RequiresConfirmation: true,
				Command:              "kubectl delete pod test-pod",
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.response)
			require.NoError(t, err)

			var decoded KubectlResponse
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.response.Output, decoded.Output)
			assert.Equal(t, tt.response.ExitCode, decoded.ExitCode)
			assert.Equal(t, tt.response.Error, decoded.Error)
			assert.Equal(t, tt.response.RequiresConfirmation, decoded.RequiresConfirmation)
		})
	}
}

func TestChatRequestMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name    string
		request ChatRequest
	}{
		{
			name: "simple prompt",
			request: ChatRequest{
				Prompt: "What is the status of my pods?",
			},
		},
		{
			name: "with agent and session",
			request: ChatRequest{
				Agent:     "claude",
				Prompt:    "Debug this issue",
				SessionID: "sess-456",
			},
		},
		{
			name: "with history",
			request: ChatRequest{
				Prompt:    "Continue the conversation",
				SessionID: "sess-789",
				History: []ChatMessage{
					{Role: "user", Content: "Hello"},
					{Role: "assistant", Content: "Hi there!"},
				},
			},
		},
		{
			name: "with cluster context and dry run",
			request: ChatRequest{
				Prompt:         "Delete unused pods",
				ClusterContext: "prod-cluster",
				DryRun:         true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.request)
			require.NoError(t, err)

			var decoded ChatRequest
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.request.Agent, decoded.Agent)
			assert.Equal(t, tt.request.Prompt, decoded.Prompt)
			assert.Equal(t, tt.request.SessionID, decoded.SessionID)
			assert.Equal(t, tt.request.ClusterContext, decoded.ClusterContext)
			assert.Equal(t, tt.request.DryRun, decoded.DryRun)
			assert.Equal(t, len(tt.request.History), len(decoded.History))
		})
	}
}

func TestChatStreamPayloadMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name    string
		payload ChatStreamPayload
	}{
		{
			name: "streaming chunk",
			payload: ChatStreamPayload{
				Content:   "Processing your request...",
				Agent:     "claude",
				SessionID: "sess-123",
				Done:      false,
			},
		},
		{
			name: "final chunk with usage",
			payload: ChatStreamPayload{
				Content:   "Task completed successfully",
				Agent:     "openai",
				SessionID: "sess-456",
				Done:      true,
				Usage: &ChatTokenUsage{
					InputTokens:  100,
					OutputTokens: 250,
					TotalTokens:  350,
				},
				ToolsExecuted: true,
			},
		},
		{
			name: "error chunk",
			payload: ChatStreamPayload{
				Content:   "An error occurred",
				Agent:     "gemini",
				SessionID: "sess-789",
				Done:      true,
				IsError:   true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.payload)
			require.NoError(t, err)

			var decoded ChatStreamPayload
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.payload.Content, decoded.Content)
			assert.Equal(t, tt.payload.Agent, decoded.Agent)
			assert.Equal(t, tt.payload.Done, decoded.Done)
			assert.Equal(t, tt.payload.IsError, decoded.IsError)
			assert.Equal(t, tt.payload.ToolsExecuted, decoded.ToolsExecuted)
		})
	}
}

func TestAgentsListPayloadMarshalUnmarshal(t *testing.T) {
	payload := AgentsListPayload{
		Agents: []AgentInfo{
			{
				Name:         "claude",
				DisplayName:  "Claude",
				Description:  "Anthropic Claude",
				Provider:     "anthropic",
				Available:    true,
				Capabilities: 3,
			},
			{
				Name:         "gpt-4",
				DisplayName:  "GPT-4",
				Description:  "OpenAI GPT-4",
				Provider:     "openai",
				Available:    false,
				Capabilities: 1,
			},
		},
		DefaultAgent: "claude",
		Selected:     "claude",
	}

	data, err := json.Marshal(payload)
	require.NoError(t, err)

	var decoded AgentsListPayload
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Len(t, decoded.Agents, 2)
	assert.Equal(t, "claude", decoded.DefaultAgent)
	assert.Equal(t, "claude", decoded.Selected)
	assert.True(t, decoded.Agents[0].Available)
	assert.False(t, decoded.Agents[1].Available)
}

func TestSelectAgentRequestMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name    string
		request SelectAgentRequest
	}{
		{
			name: "select without preserving history",
			request: SelectAgentRequest{
				Agent:           "gpt-4",
				PreserveHistory: false,
			},
		},
		{
			name: "select and preserve history",
			request: SelectAgentRequest{
				Agent:           "claude",
				PreserveHistory: true,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.request)
			require.NoError(t, err)

			var decoded SelectAgentRequest
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.request.Agent, decoded.Agent)
			assert.Equal(t, tt.request.PreserveHistory, decoded.PreserveHistory)
		})
	}
}

func TestProgressPayloadMarshalUnmarshal(t *testing.T) {
	payload := ProgressPayload{
		Step: "Executing kubectl command",
		Tool: "kubectl",
		Input: map[string]any{
			"command": "get pods",
			"context": "prod",
		},
		Output: "NAME    READY   STATUS\npod-1   1/1     Running",
	}

	data, err := json.Marshal(payload)
	require.NoError(t, err)

	var decoded ProgressPayload
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, payload.Step, decoded.Step)
	assert.Equal(t, payload.Tool, decoded.Tool)
	assert.Equal(t, payload.Output, decoded.Output)
	assert.NotNil(t, decoded.Input)
}

func TestProviderCheckResponseMarshalUnmarshal(t *testing.T) {
	tests := []struct {
		name     string
		response ProviderCheckResponse
	}{
		{
			name: "provider ready",
			response: ProviderCheckResponse{
				Provider:     "claude",
				Ready:        true,
				State:        "connected",
				Message:      "Claude is ready",
				Version:      "1.0.0",
				CliPath:      "/usr/local/bin/claude",
				HasHandshake: true,
			},
		},
		{
			name: "provider not ready with prerequisites",
			response: ProviderCheckResponse{
				Provider:      "openai",
				Ready:         false,
				State:         "failed",
				Message:       "API key not configured",
				Prerequisites: []string{"Set OPENAI_API_KEY environment variable"},
				HasHandshake:  false,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.response)
			require.NoError(t, err)

			var decoded ProviderCheckResponse
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.response.Provider, decoded.Provider)
			assert.Equal(t, tt.response.Ready, decoded.Ready)
			assert.Equal(t, tt.response.State, decoded.State)
			assert.Equal(t, tt.response.HasHandshake, decoded.HasHandshake)
		})
	}
}

func TestStateDigestPayloadMarshalUnmarshal(t *testing.T) {
	payload := StateDigestPayload{
		Sequence:  12345,
		Timestamp: 1704067200,
		Versions: map[string]string{
			"pods":        "v1234",
			"deployments": "v5678",
			"services":    "v9012",
		},
	}

	data, err := json.Marshal(payload)
	require.NoError(t, err)

	var decoded StateDigestPayload
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, payload.Sequence, decoded.Sequence)
	assert.Equal(t, payload.Timestamp, decoded.Timestamp)
	assert.Len(t, decoded.Versions, 3)
	assert.Equal(t, "v1234", decoded.Versions["pods"])
}

func TestRenameContextRequestMarshalUnmarshal(t *testing.T) {
	request := RenameContextRequest{
		OldName: "old-cluster",
		NewName: "new-cluster",
	}

	data, err := json.Marshal(request)
	require.NoError(t, err)

	var decoded RenameContextRequest
	err = json.Unmarshal(data, &decoded)
	require.NoError(t, err)
	assert.Equal(t, request.OldName, decoded.OldName)
	assert.Equal(t, request.NewName, decoded.NewName)
}

func TestMessageTypes(t *testing.T) {
	tests := []struct {
		name         string
		messageType  MessageType
		expectedType string
	}{
		{"health type", TypeHealth, "health"},
		{"clusters type", TypeClusters, "clusters"},
		{"kubectl type", TypeKubectl, "kubectl"},
		{"chat type", TypeChat, "chat"},
		{"error type", TypeError, "error"},
		{"stream chunk type", TypeStreamChunk, "stream_chunk"},
		{"progress type", TypeProgress, "progress"},
		{"agents list type", TypeAgentsList, "agents_list"},
		{"state digest type", TypeStateDigest, "state_digest"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expectedType, string(tt.messageType))
		})
	}
}

func TestTokenCountEdgeCases(t *testing.T) {
	tests := []struct {
		name  string
		count TokenCount
	}{
		{
			name:  "zero values",
			count: TokenCount{Input: 0, Output: 0},
		},
		{
			name:  "large values",
			count: TokenCount{Input: 9223372036854775807, Output: 9223372036854775807},
		},
		{
			name:  "asymmetric values",
			count: TokenCount{Input: 1000000, Output: 1},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, err := json.Marshal(tt.count)
			require.NoError(t, err)

			var decoded TokenCount
			err = json.Unmarshal(data, &decoded)
			require.NoError(t, err)
			assert.Equal(t, tt.count.Input, decoded.Input)
			assert.Equal(t, tt.count.Output, decoded.Output)
		})
	}
}
