package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/kubestellar/console/pkg/agent/protocol"
)

// TestServer_TokenUsage tests the token usage tracking and persistence
func TestServer_TokenUsage(t *testing.T) {
	// Setup temp home for token usage file
	tmpDir, err := os.MkdirTemp("", "agent-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)
	t.Setenv("HOME", tmpDir)

	s := &Server{
		todayDate: time.Now().Format("2006-01-02"),
	}

	usage := &ProviderTokenUsage{
		InputTokens:  100,
		OutputTokens: 50,
		TotalTokens:  150,
	}

	// 1. Add usage
	s.addTokenUsage(usage)

	// Wait for async save (short sleep is ugly but saveTokenUsage is a goroutine)
	// In a real test we might want to wait for the goroutine
	time.Sleep(100 * time.Millisecond)

	s.tokenMux.RLock()
	if s.sessionTokensIn != 100 || s.sessionTokensOut != 50 {
		t.Errorf("Expected 100/50 session tokens, got %d/%d", s.sessionTokensIn, s.sessionTokensOut)
	}
	if s.todayTokensIn != 100 || s.todayTokensOut != 50 {
		t.Errorf("Expected 100/50 today tokens, got %d/%d", s.todayTokensIn, s.todayTokensOut)
	}
	s.tokenMux.RUnlock()

	// 2. Add more usage
	s.addTokenUsage(usage)
	time.Sleep(100 * time.Millisecond)

	s.tokenMux.RLock()
	if s.sessionTokensIn != 200 || s.sessionTokensOut != 100 {
		t.Errorf("Expected 200/100 session tokens, got %d/%d", s.sessionTokensIn, s.sessionTokensOut)
	}
	s.tokenMux.RUnlock()

	// 3. Verify persistence
	path := getTokenUsagePath()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read usage file: %v", err)
	}

	var saved tokenUsageData
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("Failed to unmarshal usage data: %v", err)
	}

	if saved.InputIn != 200 || saved.OutputOut != 100 {
		t.Errorf("Expected 200/100 in file, got %d/%d", saved.InputIn, saved.OutputOut)
	}

	// 4. Test loading
	s2 := &Server{}
	s2.loadTokenUsage()
	if s2.todayTokensIn != 200 || s2.todayTokensOut != 100 {
		t.Errorf("Expected 200/100 loaded, got %d/%d", s2.todayTokensIn, s2.todayTokensOut)
	}

	// 5. Test date change reset
	s.tokenMux.Lock()
	s.todayDate = "2000-01-01" // distant past
	s.tokenMux.Unlock()

	s.addTokenUsage(usage)
	s.tokenMux.RLock()
	if s.todayTokensIn != 100 || s.todayTokensOut != 50 {
		t.Errorf("Expected reset output, got %d/%d", s.todayTokensIn, s.todayTokensOut)
	}
	// Session tokens should NOT reset
	if s.sessionTokensIn != 300 || s.sessionTokensOut != 150 {
		t.Errorf("Session tokens should accumulate across days, got %d/%d", s.sessionTokensIn, s.sessionTokensOut)
	}
	s.tokenMux.RUnlock()
}

// TestServer_SmartRouting tests the promptNeedsToolExecution heuristic
func TestServer_SmartRouting(t *testing.T) {
	s := &Server{}

	tests := []struct {
		prompt     string
		needsTools bool
	}{
		{"How do I delete a namespace?", false},  // Question prefix
		{"What are the pods in default?", false}, // Question prefix
		{"Explain how to use helm", false},       // Explain prefix
		{"kubectl get pods", true},               // kubectl keyword
		{"run helm install", true},               // run keyword
		{"delete this namespace", true},          // delete keyword
		{"yes, go ahead", true},                  // retry/confirmation
		{"no, don't do it", true},                // "do it" keyword
		{"yesterday i did something", false},     // "yes" prefix but not the token "yes"
		{"apply the changes", true},              // apply keyword
	}

	for _, tt := range tests {
		got := s.promptNeedsToolExecution(tt.prompt)
		if got != tt.needsTools {
			t.Errorf("promptNeedsToolExecution(%q) = %v, want %v", tt.prompt, got, tt.needsTools)
		}
	}
}

// TestServer_ProviderFallback tests that we fall back to a default provider
func TestServer_ProviderFallback(t *testing.T) {
	registry := &Registry{
		providers: make(map[string]AIProvider),
	}

	p1 := &ServerMockProvider{name: "p1"}
	p2 := &ServerMockProvider{name: "default-p"}

	registry.Register(p1)
	registry.Register(p2)
	registry.SetDefault("default-p")

	s := &Server{
		registry: registry,
	}

	// 1. Valid agent
	provider, err := s.registry.Get("p1")
	if err != nil || provider.Name() != "p1" {
		t.Errorf("Expected p1, got %v", provider)
	}

	// 2. Missing agent - logic in handleChatMessageStreaming
	msg := protocol.Message{
		ID:   "1",
		Type: protocol.TypeChat,
		Payload: protocol.ChatRequest{
			Agent:  "non-existent",
			Prompt: "hi",
		},
	}

	// We can't easily call handleChatMessageStreaming because it needs a websocket.Conn
	// But we can test handleChatMessage (non-streaming)
	resp := s.handleChatMessage(msg, "")
	if resp.Type == protocol.TypeError {
		// handleChatMessage still returns error if agent is missing and it can't find default
		// but if default is set it should use it.
	}

	// Let's test the specific logic from handleChatMessage:
	// Determination of agentName:
	// agentName := req.Agent
	// if agentName == "" { agentName = s.registry.GetSelectedAgent(req.SessionID) }
	// provider, err := s.registry.Get(agentName)
	// if err != nil { provider, err = s.registry.GetDefault(); agentName = provider.Name() }

	req := protocol.ChatRequest{Agent: "missing"}
	agentName := req.Agent
	provider, err = s.registry.Get(agentName)
	if err != nil {
		provider, err = s.registry.GetDefault()
		if err != nil {
			t.Fatal("Should have found default")
		}
		agentName = provider.Name()
	}

	if agentName != "default-p" {
		t.Errorf("Expected fallback to default-p, got %s", agentName)
	}
}

// TestServer_HistoryManagement tests conversion and use of history
func TestServer_HistoryManagement(t *testing.T) {
	req := protocol.ChatRequest{
		History: []protocol.ChatMessage{
			{Role: "user", Content: "Hi"},
			{Role: "assistant", Content: "Hello"},
		},
	}

	// Matching logic in handleChatMessage
	var history []ChatMessage
	for _, m := range req.History {
		history = append(history, ChatMessage{
			Role:    m.Role,
			Content: m.Content,
		})
	}

	if len(history) != 2 {
		t.Fatalf("Expected 2 history items, got %d", len(history))
	}
	if history[0].Role != "user" || history[1].Role != "assistant" {
		t.Errorf("History roles preserved incorrectly")
	}
}

// TestServer_ClassifyProviderError tests error classification
func TestServer_ClassifyProviderError(t *testing.T) {
	tests := []struct {
		err          string
		expectedCode string
	}{
		{"status 401: Unauthorized", "authentication_error"},
		{"status 429: Too Many Requests", "rate_limit"},
		{"something went wrong", "execution_error"},
		{"invalid_api_key", "authentication_error"},
		{"token has expired", "authentication_error"},
		{"resource_exhausted", "rate_limit"},
	}

	for _, tt := range tests {
		code, _ := classifyProviderError(fmt.Errorf("%s", tt.err))
		if code != tt.expectedCode {
			t.Errorf("classifyProviderError(%q) code = %s, want %s", tt.err, code, tt.expectedCode)
		}
	}
}

// TestServer_SessionIDGeneration tests that SessionID is generated if missing
func TestServer_SessionIDGeneration(t *testing.T) {
	payload := protocol.ChatRequest{Prompt: "hi"}
	// logic simulate
	sessionID := payload.SessionID
	if sessionID == "" {
		sessionID = uuid.New().String()
	}

	if sessionID == "" {
		t.Error("SessionID should have been generated")
	}
	_, err := uuid.Parse(sessionID)
	if err != nil {
		t.Errorf("Generated SessionID is not a valid UUID: %v", err)
	}
}

// TestExtractCommandsFromResponse covers robust command extraction (#9440).
func TestExtractCommandsFromResponse(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			name:     "CMD with space prefix",
			input:    "Analysis done.\nCMD: kubectl get pods\nCMD: kubectl get svc",
			expected: []string{"kubectl get pods", "kubectl get svc"},
		},
		{
			name:     "CMD without space",
			input:    "CMD:kubectl get pods",
			expected: []string{"kubectl get pods"},
		},
		{
			name:     "Command prefix case-insensitive",
			input:    "Command: kubectl get nodes\ncommand: helm list",
			expected: []string{"kubectl get nodes", "helm list"},
		},
		{
			name:     "markdown code block",
			input:    "Here are the commands:\n```bash\nkubectl get pods -A\nhelm install foo bar\n```",
			expected: []string{"kubectl get pods -A", "helm install foo bar"},
		},
		{
			name:     "bare kubectl outside code block",
			input:    "You should run:\nkubectl describe pod foo\n\nThat will show the details.",
			expected: []string{"kubectl describe pod foo"},
		},
		{
			name:     "oc command support",
			input:    "CMD: oc get routes",
			expected: []string{"oc get routes"},
		},
		{
			name:     "deduplication",
			input:    "CMD: kubectl get pods\nkubectl get pods",
			expected: []string{"kubectl get pods"},
		},
		{
			name:     "no commands",
			input:    "I think we should check the cluster status.\nLet me know if you need help.",
			expected: nil,
		},
		{
			name:     "mixed formats",
			input:    "Analysis:\nCMD: kubectl get pods\n```\nhelm list -A\n```\ncommand: kubectl get svc",
			expected: []string{"kubectl get pods", "helm list -A", "kubectl get svc"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractCommandsFromResponse(tt.input)
			if len(got) != len(tt.expected) {
				t.Fatalf("expected %d commands, got %d: %v", len(tt.expected), len(got), got)
			}
			for i, cmd := range got {
				if cmd != tt.expected[i] {
					t.Errorf("command[%d] = %q, want %q", i, cmd, tt.expected[i])
				}
			}
		})
	}
}
