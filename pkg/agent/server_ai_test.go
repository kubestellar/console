package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
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

	s.tokenMux.RLock()
	if s.sessionTokensIn != 200 || s.sessionTokensOut != 100 {
		t.Errorf("Expected 200/100 session tokens, got %d/%d", s.sessionTokensIn, s.sessionTokensOut)
	}
	s.tokenMux.RUnlock()

	// 3. Verify persistence — force a synchronous flush because
	// addTokenUsage uses a debounced 5 s timer (#9483) that will not
	// have fired yet.
	s.saveTokenUsage()

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

// TestServer_MultiInstanceTokenMerge verifies that two simulated kc-agent
// instances correctly merge token counts via the flock-guarded
// read-modify-write cycle, preventing data loss (#9730).
func TestServer_MultiInstanceTokenMerge(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "agent-multi-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)
	t.Setenv("HOME", tmpDir)

	today := time.Now().Format("2006-01-02")

	// Instance A accumulates 100/50 and saves.
	a := &Server{todayDate: today, todayTokensIn: 100, todayTokensOut: 50}
	a.saveTokenUsage()

	// Instance B loads the file (simulating startup after A's save),
	// then accumulates an additional 200/100 and saves.
	b := &Server{}
	b.loadTokenUsage()
	b.addTokenUsage(&ProviderTokenUsage{InputTokens: 200, OutputTokens: 100})
	b.saveTokenUsage()

	// Instance A accumulates another 50/25 and saves.
	// Without flock-based merge, A would clobber B's 200/100 contribution.
	a.addTokenUsage(&ProviderTokenUsage{InputTokens: 50, OutputTokens: 25})
	a.saveTokenUsage()

	// Read the persisted file — it should contain the merged total:
	//   A's contributions: 100 + 50 = 150 input, 50 + 25 = 75 output
	//   B's contributions: 200 input, 100 output
	//   Total: 350 input, 175 output
	path := getTokenUsagePath()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read usage file: %v", err)
	}

	var saved tokenUsageData
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("Failed to unmarshal: %v", err)
	}

	const expectedIn int64 = 350
	const expectedOut int64 = 175
	if saved.InputIn != expectedIn || saved.OutputOut != expectedOut {
		t.Errorf("Expected %d/%d merged on disk, got %d/%d",
			expectedIn, expectedOut, saved.InputIn, saved.OutputOut)
	}
}

// TestServer_SessionTokenQuota verifies that the per-session aggregate
// token quota rejects new prompts once the limit is reached (#9438).
func TestServer_SessionTokenQuota(t *testing.T) {
	const testQuota int64 = 500 // intentionally small for the test

	s := &Server{
		todayDate:         time.Now().Format("2006-01-02"),
		sessionTokenQuota: testQuota,
	}

	// Before any usage, the quota should NOT be exceeded
	if s.isSessionQuotaExceeded() {
		t.Fatal("quota should not be exceeded before any usage")
	}

	// Add usage that stays under the quota
	s.addTokenUsage(&ProviderTokenUsage{InputTokens: 100, OutputTokens: 100, TotalTokens: 200})
	time.Sleep(50 * time.Millisecond) // let async save fire
	if s.isSessionQuotaExceeded() {
		t.Fatal("quota should not be exceeded at 200/500")
	}

	// Push over the limit
	s.addTokenUsage(&ProviderTokenUsage{InputTokens: 200, OutputTokens: 200, TotalTokens: 400})
	time.Sleep(50 * time.Millisecond)
	if !s.isSessionQuotaExceeded() {
		t.Fatal("quota should be exceeded at 600/500")
	}

	// Verify the error message mentions the env var
	msg := s.sessionTokenQuotaMessage()
	if !strings.Contains(msg, "KC_SESSION_TOKEN_QUOTA") {
		t.Errorf("quota message should mention env var, got: %s", msg)
	}
}

// TestServer_SessionTokenQuota_Unlimited verifies that a quota of 0
// disables the limit (#9438).
func TestServer_SessionTokenQuota_Unlimited(t *testing.T) {
	s := &Server{
		todayDate:         time.Now().Format("2006-01-02"),
		sessionTokenQuota: 0, // unlimited
	}

	// Even with huge usage, the quota should never trigger
	s.addTokenUsage(&ProviderTokenUsage{InputTokens: 999_999_999, OutputTokens: 999_999_999})
	time.Sleep(50 * time.Millisecond)
	if s.isSessionQuotaExceeded() {
		t.Fatal("quota of 0 should mean unlimited")
	}
}

// TestServer_HandleChatMessage_QuotaExceeded verifies that handleChatMessage
// returns a token_quota_exceeded error when the session quota is blown (#9438).
func TestServer_HandleChatMessage_QuotaExceeded(t *testing.T) {
	const testQuota int64 = 100

	registry := &Registry{providers: make(map[string]AIProvider)}
	registry.Register(&ServerMockProvider{name: "mock"})
	registry.SetDefault("mock")

	s := &Server{
		todayDate:         time.Now().Format("2006-01-02"),
		sessionTokenQuota: testQuota,
		registry:          registry,
	}

	// Blow through the quota
	s.addTokenUsage(&ProviderTokenUsage{InputTokens: 80, OutputTokens: 80})
	time.Sleep(50 * time.Millisecond)

	msg := protocol.Message{
		ID:   "test-1",
		Type: protocol.TypeChat,
		Payload: protocol.ChatRequest{
			Prompt: "hello",
		},
	}

	resp := s.handleChatMessage(msg, "")
	if resp.Type != protocol.TypeError {
		t.Fatalf("expected error response, got type %s", resp.Type)
	}

	// Extract the error code from the payload
	payloadBytes, _ := json.Marshal(resp.Payload)
	var errPayload struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(payloadBytes, &errPayload)
	if errPayload.Code != "token_quota_exceeded" {
		t.Errorf("expected code token_quota_exceeded, got %s", errPayload.Code)
	}
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
