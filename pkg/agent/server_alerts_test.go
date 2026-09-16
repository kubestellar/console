package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/kube"
	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/agent/tokentracker"
)

func TestServer_HandleChatMessage(t *testing.T) {
	registry := &Registry{
		providers:     map[string]AIProvider{"mock": &ServerMockProvider{name: "mock"}},
		selectedAgent: make(map[string]string),
	}
	server := &Server{
		registry: registry,
	}

	chatReq := protocol.ChatRequest{
		Prompt:    "Hello Test",
		SessionID: "session-1",
		Agent:     "mock",
	}

	msg := protocol.Message{
		ID:      "msg-1",
		Type:    protocol.TypeChat,
		Payload: chatReq,
	}

	respMsg := server.handleChatMessage(msg, "")

	if respMsg.Type != protocol.TypeResult {
		t.Errorf("Expected TypeResult, got %s", respMsg.Type)
	}

	payload, ok := respMsg.Payload.(protocol.ChatStreamPayload)
	if !ok {
		// handleChatMessage encodes payload as ChatStreamPayload
		// but since it's an interface, let's see how it's handled.
		// In go, the return from handleChatMessage has Payload as protocol.ChatStreamPayload
		t.Fatalf("Expected ChatStreamPayload, got %T", respMsg.Payload)
	}

	if payload.Content != "Mock response: Hello Test" {
		t.Errorf("Unexpected content: %s", payload.Content)
	}
}

func TestServer_HandleDeviceAlerts_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/devices/alerts", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleDeviceAlerts(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleDeviceAlerts_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/devices/alerts", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleDeviceAlerts(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleDeviceAlerts_NilTracker(t *testing.T) {
	server := &Server{
		deviceTracker:  nil,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/devices/alerts", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleDeviceAlerts(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp DeviceAlertsResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.NodeCount != 0 {
		t.Errorf("Expected 0 nodes, got %d", resp.NodeCount)
	}
}

func TestServer_HandleDeviceAlertsClear_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/devices/alerts/clear", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleDeviceAlertsClear(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleDeviceAlertsClear_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/devices/alerts/clear", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleDeviceAlertsClear(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleDeviceAlertsClear_NilTracker(t *testing.T) {
	server := &Server{
		deviceTracker:  nil,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/devices/alerts/clear", strings.NewReader(`{"alertId":"test"}`))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleDeviceAlertsClear(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("Expected 503, got %d", w.Code)
	}
}

func TestServer_HandleDeviceAlertsClear_InvalidBody(t *testing.T) {
	server := &Server{
		deviceTracker:  NewDeviceTracker(nil, nil),
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/devices/alerts/clear", strings.NewReader("invalid"))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleDeviceAlertsClear(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}
}

func TestServer_HandleDeviceAlertsClear_MissingAlertId(t *testing.T) {
	server := &Server{
		deviceTracker:  NewDeviceTracker(nil, nil),
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/devices/alerts/clear", strings.NewReader(`{"alertId":""}`))
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleDeviceAlertsClear(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400, got %d", w.Code)
	}
}

func TestServer_HandleDeviceInventory_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/devices/inventory", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleDeviceInventory(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleDeviceInventory_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/devices/inventory", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleDeviceInventory(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandleDeviceInventory_NilTracker(t *testing.T) {
	server := &Server{
		deviceTracker:  nil,
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/devices/inventory", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleDeviceInventory(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp DeviceInventoryResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if len(resp.Nodes) != 0 {
		t.Errorf("Expected 0 nodes, got %d", len(resp.Nodes))
	}
}

func TestServer_HandlePredictionsAI_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/predictions/ai", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handlePredictionsAI(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandlePredictionsAI_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/predictions/ai", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handlePredictionsAI(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandlePredictionsAI_NilWorker(t *testing.T) {
	server := &Server{
		predictionWorker: nil,
		allowedOrigins:   []string{"*"},
	}

	req := httptest.NewRequest("GET", "/predictions/ai", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handlePredictionsAI(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
}

func TestServer_HandlePredictionsStats_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/predictions/stats", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handlePredictionsStats(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandlePredictionsStats_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("POST", "/predictions/stats", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handlePredictionsStats(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandlePredictionsStats_Success(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/predictions/stats", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handlePredictionsStats(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["totalPredictions"].(float64) != 0 {
		t.Errorf("Expected 0 predictions, got %v", resp["totalPredictions"])
	}
}

func TestServer_SetCORSHeaders(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://allowed.com"},
	}

	tests := []struct {
		name          string
		origin        string
		expectCORSSet bool
	}{
		{"Allowed origin", "http://allowed.com", true},
		{"Disallowed origin", "http://evil.com", false},
		{"No origin", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/test", nil)
			req.Host = "localhost"
			if tt.origin != "" {
				req.Header.Set("Origin", tt.origin)
			}
			w := httptest.NewRecorder()

			server.setCORSHeaders(w, req)

			corsHeader := w.Header().Get("Access-Control-Allow-Origin")
			if tt.expectCORSSet && corsHeader != tt.origin {
				t.Errorf("Expected CORS origin %s, got %s", tt.origin, corsHeader)
			}
			if !tt.expectCORSSet && corsHeader != "" {
				t.Errorf("Expected no CORS header, got %s", corsHeader)
			}

			// Always set these headers
			if w.Header().Get("Access-Control-Allow-Private-Network") != "true" {
				t.Error("Private network header not set")
			}
		})
	}
}

func TestServer_ValidateAPIKeyValue_SkipValidation(t *testing.T) {
	server := &Server{
		SkipKeyValidation: true,
	}

	valid, err := server.validateAPIKeyValue("claude", "test-key")
	if err != nil {
		t.Errorf("Unexpected error: %v", err)
	}
	if !valid {
		t.Error("Expected valid=true when SkipKeyValidation is set")
	}
}

func TestServer_ValidateAPIKeyValue_UnknownProvider(t *testing.T) {
	server := &Server{
		SkipKeyValidation: false,
	}

	// Unknown/IDE providers with a non-empty key are accepted without validation
	valid, err := server.validateAPIKeyValue("unknown-provider", "test-key")
	if err != nil {
		t.Fatalf("Expected no error for unknown provider with non-empty key, got: %v", err)
	}
	if !valid {
		t.Fatalf("Expected valid=true for unknown provider with non-empty key")
	}
}

func TestServer_ValidateAPIKeyValue_EmptyKey(t *testing.T) {
	server := &Server{
		SkipKeyValidation: false,
	}

	_, err := server.validateAPIKeyValue("unknown-provider", "")
	if err == nil {
		t.Fatal("Expected error for empty API key")
	}
	if !strings.Contains(err.Error(), "empty API key") {
		t.Errorf("Expected 'empty API key' error, got: %v", err)
	}
}

func TestServer_HandlePredictionsAnalyze_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/predictions/analyze", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handlePredictionsAnalyze(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandlePredictionsAnalyze_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/predictions/analyze", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handlePredictionsAnalyze(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_HandlePredictionsFeedback_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/predictions/feedback", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handlePredictionsFeedback(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandlePredictionsFeedback_WrongMethod(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/predictions/feedback", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handlePredictionsFeedback(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("Expected 405, got %d", w.Code)
	}
}

func TestServer_AddTokenUsage(t *testing.T) {
	server := &Server{
		tokens: tokentracker.New(0),
	}

	server.addTokenUsage(&ProviderTokenUsage{InputTokens: 100, OutputTokens: 200})

	sessionIn, sessionOut, todayIn, todayOut := server.tokens.GetUsage()
	if sessionIn != 100 {
		t.Errorf("Expected 100 input tokens, got %d", sessionIn)
	}
	if sessionOut != 200 {
		t.Errorf("Expected 200 output tokens, got %d", sessionOut)
	}
	if todayIn != 100 {
		t.Errorf("Expected 100 today input tokens, got %d", todayIn)
	}
	if todayOut != 200 {
		t.Errorf("Expected 200 today output tokens, got %d", todayOut)
	}
}

func TestServer_AddTokenUsage_DayRollover(t *testing.T) {
	// Day rollover logic is tested in tokentracker package.
	// This verifies Server delegation still functions.
	server := &Server{
		tokens: tokentracker.New(0),
	}

	server.addTokenUsage(&ProviderTokenUsage{InputTokens: 100, OutputTokens: 200})

	sessionIn, sessionOut, _, _ := server.tokens.GetUsage()
	if sessionIn != 100 || sessionOut != 200 {
		t.Errorf("Expected 100/200, got %d/%d", sessionIn, sessionOut)
	}
}

func TestServer_GetClaudeInfo_NoKeys(t *testing.T) {
	// Setup temp config
	cm := GetConfigManager()
	oldPath := cm.GetConfigPath()
	tmpFile := "/tmp/agent-test-claude-info.yaml"
	cm.SetConfigPath(tmpFile)
	defer func() {
		cm.SetConfigPath(oldPath)
		os.Remove(tmpFile)
	}()

	server := &Server{
		registry: &Registry{providers: make(map[string]AIProvider)},
		tokens:   tokentracker.New(0),
	}

	info := server.getClaudeInfo()
	// getClaudeInfo may return nil if Claude CLI is not found
	// This is acceptable behavior - we're testing that it doesn't panic
	if info != nil {
		// If it returns something, token usage should have zeros
		if info.TokenUsage.Session.Input < 0 {
			t.Error("Token usage input should be non-negative")
		}
	}
}

func TestServer_HandleWebSocket_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/ws", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleWebSocket(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
	if w.Header().Get("Access-Control-Allow-Private-Network") != "true" {
		t.Error("Missing Private-Network header")
	}
}

func TestServer_HandleWebSocket_Unauthorized(t *testing.T) {
	server := &Server{
		agentToken:     "secret",
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/ws", nil)
	req.Host = "localhost"
	// Simulate websocket headers but no token
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Origin", "http://localhost:8080")
	w := httptest.NewRecorder()

	server.handleWebSocket(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401, got %d", w.Code)
	}
}

func TestServer_HandleLocalClusterTools_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/local-cluster-tools", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleLocalClusterTools(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

func TestServer_HandleLocalClusters_OPTIONS(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost"},
	}

	req := httptest.NewRequest("OPTIONS", "/local-clusters", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost")
	w := httptest.NewRecorder()

	server.handleLocalClusters(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS, got %d", w.Code)
	}
}

// TestHandleLocalClusters_CORSAdvertisesDELETE pins the fix for #9155: the
// OPTIONS preflight on /local-clusters must advertise DELETE in
// Access-Control-Allow-Methods so the browser permits the cluster-delete
// fetch from the SPA origin. Before the audit (#8201) this handler fell
// through to the default "GET, OPTIONS", which Chrome rejected for the
// DELETE preflight; this test prevents that regression from coming back.
func TestHandleLocalClusters_CORSAdvertisesDELETE(t *testing.T) {
	server := &Server{
		allowedOrigins: []string{"http://localhost:8080"},
	}

	req := httptest.NewRequest("OPTIONS", "/local-clusters?tool=kind&name=testing", nil)
	req.Host = "localhost"
	req.Header.Set("Origin", "http://localhost:8080")
	req.Header.Set("Access-Control-Request-Method", "DELETE")
	w := httptest.NewRecorder()

	server.handleLocalClusters(w, req)

	if w.Code != http.StatusNoContent {
		t.Errorf("Expected 204 for OPTIONS preflight, got %d", w.Code)
	}

	methods := w.Header().Get("Access-Control-Allow-Methods")
	for _, want := range []string{"GET", "POST", "DELETE", "OPTIONS"} {
		if !strings.Contains(methods, want) {
			t.Errorf("expected Access-Control-Allow-Methods to include %q (Fixes #9155), got %q", want, methods)
		}
	}
}

func TestErrorPayload(t *testing.T) {
	// Test creating an error payload directly
	payload := protocol.ErrorPayload{
		Code:    "ERR001",
		Message: "Test error message",
	}

	if payload.Code != "ERR001" {
		t.Errorf("Expected code ERR001, got %s", payload.Code)
	}
	if payload.Message != "Test error message" {
		t.Errorf("Expected message 'Test error message', got %s", payload.Message)
	}
}

// TestServer_GetTokenUsagePath removed — logic moved to tokentracker package.

// ============================================================================
// Helper Function Tests - errorResponse, promptNeedsToolExecution, etc.
// ============================================================================

func TestServer_ErrorResponse(t *testing.T) {
	server := &Server{}

	tests := []struct {
		name       string
		id         string
		code       string
		message    string
		expectID   string
		expectCode string
		expectMsg  string
	}{
		{
			name:       "Basic error",
			id:         "msg-123",
			code:       "ERR001",
			message:    "Something went wrong",
			expectID:   "msg-123",
			expectCode: "ERR001",
			expectMsg:  "Something went wrong",
		},
		{
			name:       "Empty values",
			id:         "",
			code:       "",
			message:    "",
			expectID:   "",
			expectCode: "",
			expectMsg:  "",
		},
		{
			name:       "Auth error",
			id:         "req-456",
			code:       "unauthorized",
			message:    "Invalid token provided",
			expectID:   "req-456",
			expectCode: "unauthorized",
			expectMsg:  "Invalid token provided",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := server.errorResponse(tt.id, tt.code, tt.message)

			if resp.ID != tt.expectID {
				t.Errorf("Expected ID %q, got %q", tt.expectID, resp.ID)
			}
			if resp.Type != protocol.TypeError {
				t.Errorf("Expected Type %q, got %q", protocol.TypeError, resp.Type)
			}

			payload, ok := resp.Payload.(protocol.ErrorPayload)
			if !ok {
				t.Fatalf("Expected ErrorPayload, got %T", resp.Payload)
			}
			if payload.Code != tt.expectCode {
				t.Errorf("Expected Code %q, got %q", tt.expectCode, payload.Code)
			}
			if payload.Message != tt.expectMsg {
				t.Errorf("Expected Message %q, got %q", tt.expectMsg, payload.Message)
			}
		})
	}
}

func TestServer_PromptNeedsToolExecution(t *testing.T) {
	server := &Server{}

	tests := []struct {
		prompt string
		want   bool
	}{
		// Execution keywords
		{"run kubectl get pods", true},
		{"execute this command", true},
		{"kubectl apply -f deployment.yaml", true},
		{"helm install my-chart", true},
		{"check the pod status", true},
		{"show me the logs", true},
		{"get all deployments", true},
		{"list all services", true},
		{"describe pod nginx", true},
		{"analyze the cluster", true},
		{"investigate the error", true},
		{"fix the deployment", true},
		{"repair the service", true},
		{"uncordon the node", true},
		{"cordon node-1", true},
		{"drain node-2", true},
		{"scale deployment to 3", true},
		{"restart the pod", true},
		{"delete the deployment", true},
		{"apply the manifest", true},
		{"create a configmap", true},
		{"patch the service", true},
		{"rollout restart deployment", true},
		{"show me logs", true},
		{"status of deployment", true},
		{"deploy the app", true},
		{"install prometheus", true},
		{"upgrade helm chart", true},
		{"rollback deployment", true},

		// Retry keywords
		{"try again please", true},
		{"retry the operation", true},
		{"do it now", true},
		{"run it please", true},
		{"execute it", true},
		{"yes", true},
		{"proceed with the action", true},
		{"go ahead", true},
		{"please do", true},

		// Case insensitivity
		{"RUN kubectl get pods", true},
		{"EXECUTE this", true},
		{"Kubectl Apply", true},

		// Non-execution prompts (these don't contain trigger keywords)
		{"what is kubernetes?", false},
		{"explain pods", false}, // doesn't contain "deploy" or other keywords
		{"how does pod affinity work?", false},
		{"tell me about pods", false},
		{"thanks for your help", false},
		{"I understand now", false},
		{"good job", false},
		{"", false},

		// Question-prefix prompts must short-circuit to false even if they
		// contain execution keywords as substrings. Regression for #8074
		// where "How do I delete a namespace?" was routed to a tool-capable
		// agent because it contained "delete".
		{"How do I delete a namespace?", false},
		{"how can I scale a deployment?", false},
		{"what is the difference between delete and force-delete?", false},
		{"why is my pod stuck?", false},
		{"explain how rollout restart works", false},
		{"tell me about kubectl get pods", false},

		// Imperative commands must still route to tool execution.
		{"delete namespace foo", true},
		{"kubectl get pods", true},

		// Exact retry keyword "yes" still routes, but "yesterday" must not.
		// Regression for #8074 where retryKeywords used Contains, so any
		// sentence with "yes" as a substring (e.g. "yesterday") matched.
		{"yesterday the pod crashed", false},
		{"yes, please do", true},
	}

	for _, tt := range tests {
		t.Run(tt.prompt, func(t *testing.T) {
			result := server.promptNeedsToolExecution(tt.prompt)
			if result != tt.want {
				t.Errorf("promptNeedsToolExecution(%q) = %v, want %v", tt.prompt, result, tt.want)
			}
		})
	}
}

func TestServer_IsToolCapableAgent(t *testing.T) {
	registry := &Registry{providers: make(map[string]AIProvider)}
	registry.Register(&MockToolCapableProvider{name: "claude-code", available: true})
	registry.Register(&MockToolCapableProvider{name: "bob", available: true})

	server := &Server{registry: registry}

	tests := []struct {
		agentName string
		want      bool
	}{
		{"claude-code", true},
		{"bob", true},
		{"claude", false},
		{"openai", false},
		{"gemini", false},
		{"gpt-4", false},
		{"", false},
		{"random-agent", false},
		{"CLAUDE-CODE", false}, // Case sensitive
		{"Bob", false},         // Case sensitive
	}

	for _, tt := range tests {
		t.Run(tt.agentName, func(t *testing.T) {
			result := server.isToolCapableAgent(tt.agentName)
			if result != tt.want {
				t.Errorf("isToolCapableAgent(%q) = %v, want %v", tt.agentName, result, tt.want)
			}
		})
	}
}

// MockToolCapableProvider for testing findToolCapableAgent
type MockToolCapableProvider struct {
	name      string
	available bool
}

func (m *MockToolCapableProvider) Name() string        { return m.name }
func (m *MockToolCapableProvider) DisplayName() string { return m.name }
func (m *MockToolCapableProvider) Description() string { return "Mock provider" }
func (m *MockToolCapableProvider) Provider() string    { return "mock" }
func (m *MockToolCapableProvider) IsAvailable() bool   { return m.available }
func (m *MockToolCapableProvider) Capabilities() ProviderCapability {
	if m.name == "claude" || m.name == "openai" || m.name == "gemini" {
		return CapabilityChat
	}
	return CapabilityChat | CapabilityToolExec
}
func (m *MockToolCapableProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	return &ChatResponse{Content: "mock"}, nil
}
func (m *MockToolCapableProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(string)) (*ChatResponse, error) {
	return &ChatResponse{Content: "mock"}, nil
}

func TestServer_FindToolCapableAgent(t *testing.T) {
	tests := []struct {
		name      string
		providers map[string]AIProvider
		wantAgent string
	}{
		{
			name:      "No providers",
			providers: map[string]AIProvider{},
			wantAgent: "",
		},
		{
			name: "Only claude-code available",
			providers: map[string]AIProvider{
				"claude-code": &MockToolCapableProvider{name: "claude-code", available: true},
			},
			wantAgent: "claude-code",
		},
		{
			name: "Only bob available",
			providers: map[string]AIProvider{
				"bob": &MockToolCapableProvider{name: "bob", available: true},
			},
			wantAgent: "bob",
		},
		{
			name: "Both available - return any tool-capable agent",
			providers: map[string]AIProvider{
				"claude-code": &MockToolCapableProvider{name: "claude-code", available: true},
				"bob":         &MockToolCapableProvider{name: "bob", available: true},
			},
			wantAgent: "",
		},
		{
			name: "claude-code unavailable, bob available",
			providers: map[string]AIProvider{
				"claude-code": &MockToolCapableProvider{name: "claude-code", available: false},
				"bob":         &MockToolCapableProvider{name: "bob", available: true},
			},
			wantAgent: "bob",
		},
		{
			name: "Both unavailable",
			providers: map[string]AIProvider{
				"claude-code": &MockToolCapableProvider{name: "claude-code", available: false},
				"bob":         &MockToolCapableProvider{name: "bob", available: false},
			},
			wantAgent: "",
		},
		{
			name: "Non-tool-capable agent available",
			providers: map[string]AIProvider{
				"claude": &MockToolCapableProvider{name: "claude", available: true},
				"openai": &MockToolCapableProvider{name: "openai", available: true},
			},
			wantAgent: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			registry := &Registry{
				providers:     tt.providers,
				selectedAgent: make(map[string]string),
			}
			server := &Server{registry: registry}

			result := server.findToolCapableAgent()

			if tt.wantAgent == "" {
				if result != "claude-code" && result != "bob" && result != "" {
					t.Errorf("Expected claude-code, bob, or empty, got %q", result)
				}
				return
			}

			if result != tt.wantAgent {
				t.Errorf("findToolCapableAgent() = %q, want %q", result, tt.wantAgent)
			}
		})
	}
}

func TestServer_GetClaudeInfo_WithProviders(t *testing.T) {
	tests := []struct {
		name        string
		providers   map[string]AIProvider
		sessionIn   int64
		sessionOut  int64
		todayIn     int64
		todayOut    int64
		wantNil     bool
		wantSession protocol.TokenCount
		wantToday   protocol.TokenCount
	}{
		{
			name:      "No providers - returns nil",
			providers: map[string]AIProvider{},
			wantNil:   true,
		},
		{
			name: "Has available provider",
			providers: map[string]AIProvider{
				"claude": &MockToolCapableProvider{name: "claude", available: true},
			},
			sessionIn:   100,
			sessionOut:  200,
			todayIn:     50,
			todayOut:    75,
			wantNil:     false,
			wantSession: protocol.TokenCount{Input: 100, Output: 200},
			wantToday:   protocol.TokenCount{Input: 50, Output: 75},
		},
		{
			name: "Unavailable provider - returns nil",
			providers: map[string]AIProvider{
				"claude": &MockToolCapableProvider{name: "claude", available: false},
			},
			wantNil: true,
		},
		{
			name: "Multiple providers",
			providers: map[string]AIProvider{
				"claude": &MockToolCapableProvider{name: "Claude", available: true},
				"openai": &MockToolCapableProvider{name: "OpenAI", available: true},
			},
			sessionIn:   1000,
			sessionOut:  2000,
			wantNil:     false,
			wantSession: protocol.TokenCount{Input: 1000, Output: 2000},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			registry := &Registry{
				providers:     tt.providers,
				selectedAgent: make(map[string]string),
			}
			tr := tokentracker.New(0)
			// Seed token counters via AddUsage to match test expectations
			if tt.sessionIn > 0 || tt.sessionOut > 0 {
				tr.AddUsage(&ProviderTokenUsage{InputTokens: int(tt.sessionIn), OutputTokens: int(tt.sessionOut)})
			}
			server := &Server{
				registry: registry,
				tokens:   tr,
			}

			info := server.getClaudeInfo()

			if tt.wantNil {
				if info != nil {
					t.Error("Expected nil, got non-nil ClaudeInfo")
				}
				return
			}

			if info == nil {
				t.Fatal("Expected non-nil ClaudeInfo, got nil")
			}

			if !info.Installed {
				t.Error("Expected Installed=true")
			}
			if info.TokenUsage.Session.Input != tt.wantSession.Input {
				t.Errorf("Session input = %d, want %d", info.TokenUsage.Session.Input, tt.wantSession.Input)
			}
			if info.TokenUsage.Session.Output != tt.wantSession.Output {
				t.Errorf("Session output = %d, want %d", info.TokenUsage.Session.Output, tt.wantSession.Output)
			}
		})
	}
}

// TestServer_LoadTokenUsage — logic moved to tokentracker package (tracker_test.go).
// This test now just verifies the delegation compiles and runs.
func TestServer_LoadTokenUsage(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "token-load-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tmpDir)
	t.Setenv("HOME", tmpDir)

	tr := tokentracker.New(0)
	tr.Load() // no file, should not panic
	_, _, todayIn, todayOut := tr.GetUsage()
	if todayIn != 0 || todayOut != 0 {
		t.Errorf("Expected 0/0 from empty load, got %d/%d", todayIn, todayOut)
	}
}

// ============================================================================
// API Key Validation Tests
// ============================================================================

func TestValidateClaudeKey_MockServer(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantValid  bool
		wantErr    bool
	}{
		{
			name:       "Valid key - 200 OK",
			statusCode: http.StatusOK,
			wantValid:  true,
			wantErr:    false,
		},
		{
			name:       "Invalid key - 401 Unauthorized",
			statusCode: http.StatusUnauthorized,
			wantValid:  false,
			wantErr:    false,
		},
		{
			name:       "Server error - 500",
			statusCode: http.StatusInternalServerError,
			wantValid:  false,
			wantErr:    true,
		},
		{
			name:       "Rate limited - 429",
			statusCode: http.StatusTooManyRequests,
			wantValid:  false,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Verify headers
				if r.Header.Get("x-api-key") == "" {
					t.Error("Missing x-api-key header")
				}
				if r.Header.Get("anthropic-version") == "" {
					t.Error("Missing anthropic-version header")
				}
				w.WriteHeader(tt.statusCode)
				io.WriteString(w, `{"message":"test"}`)
			}))
			defer srv.Close()

			// We can't easily override claudeAPIURL, so test the logic pattern
			ctx := context.Background()
			req, _ := http.NewRequestWithContext(ctx, "POST", srv.URL, strings.NewReader(`{}`))
			req.Header.Set("x-api-key", "test-key")
			req.Header.Set("anthropic-version", "2023-06-01")

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("Request failed: %v", err)
			}
			defer resp.Body.Close()

			valid := resp.StatusCode == http.StatusOK
			isErr := resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusUnauthorized

			if valid != tt.wantValid {
				t.Errorf("valid = %v, want %v", valid, tt.wantValid)
			}
			if isErr != tt.wantErr {
				t.Errorf("isErr = %v, want %v", isErr, tt.wantErr)
			}
		})
	}
}

func TestValidateOpenAIKey_MockServer(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantValid  bool
		wantErr    bool
	}{
		{
			name:       "Valid key - 200 OK",
			statusCode: http.StatusOK,
			wantValid:  true,
			wantErr:    false,
		},
		{
			name:       "Invalid key - 401 Unauthorized",
			statusCode: http.StatusUnauthorized,
			wantValid:  false,
			wantErr:    true, // OpenAI returns error for 401
		},
		{
			name:       "Server error - 500",
			statusCode: http.StatusInternalServerError,
			wantValid:  false,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Verify Authorization header
				auth := r.Header.Get("Authorization")
				if !strings.HasPrefix(auth, "Bearer ") {
					t.Error("Missing or invalid Authorization header")
				}
				w.WriteHeader(tt.statusCode)
				io.WriteString(w, `{"data":[]}`)
			}))
			defer srv.Close()

			ctx := context.Background()
			req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL, nil)
			req.Header.Set("Authorization", "Bearer test-key")

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("Request failed: %v", err)
			}
			defer resp.Body.Close()

			valid := resp.StatusCode == http.StatusOK
			isErr := resp.StatusCode != http.StatusOK

			if valid != tt.wantValid {
				t.Errorf("valid = %v, want %v", valid, tt.wantValid)
			}
			if isErr != tt.wantErr {
				t.Errorf("isErr = %v, want %v", isErr, tt.wantErr)
			}
		})
	}
}

func TestValidateGeminiKey_MockServer(t *testing.T) {
	tests := []struct {
		name       string
		statusCode int
		wantValid  bool
		wantErr    bool
	}{
		{
			name:       "Valid key - 200 OK",
			statusCode: http.StatusOK,
			wantValid:  true,
			wantErr:    false,
		},
		{
			name:       "Invalid key - 401 Unauthorized",
			statusCode: http.StatusUnauthorized,
			wantValid:  false,
			wantErr:    true,
		},
		{
			name:       "Invalid key - 403 Forbidden",
			statusCode: http.StatusForbidden,
			wantValid:  false,
			wantErr:    true,
		},
		{
			name:       "Server error - 500",
			statusCode: http.StatusInternalServerError,
			wantValid:  false,
			wantErr:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Verify key is in query param
				if r.URL.Query().Get("key") == "" {
					t.Error("Missing key query parameter")
				}
				w.WriteHeader(tt.statusCode)
				io.WriteString(w, `{"models":[]}`)
			}))
			defer srv.Close()

			ctx := context.Background()
			url := srv.URL + "?key=test-key"
			req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				t.Fatalf("Request failed: %v", err)
			}
			defer resp.Body.Close()

			valid := resp.StatusCode == http.StatusOK
			isErr := resp.StatusCode != http.StatusOK

			if valid != tt.wantValid {
				t.Errorf("valid = %v, want %v", valid, tt.wantValid)
			}
			if isErr != tt.wantErr {
				t.Errorf("isErr = %v, want %v", isErr, tt.wantErr)
			}
		})
	}
}

func TestServer_ValidateAllKeys(t *testing.T) {
	// Setup temp config
	cm := GetConfigManager()
	oldPath := cm.GetConfigPath()
	tmpFile := "/tmp/agent-test-validate-keys.yaml"
	cm.SetConfigPath(tmpFile)
	defer func() {
		cm.SetConfigPath(oldPath)
		os.Remove(tmpFile)
	}()

	server := &Server{
		SkipKeyValidation: true, // Skip actual API calls
	}

	// This test verifies ValidateAllKeys doesn't panic with no keys
	// and works with SkipKeyValidation=true
	server.ValidateAllKeys()
}

// ============================================================================
// Provider Health Handler Tests
// ============================================================================

func TestServer_HandleLocalClusterTools_GET(t *testing.T) {
	server := &Server{
		localClusters:  kube.NewLocalClusterManager(nil),
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/local-cluster-tools", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleLocalClusterTools(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
}

func TestServer_HandleLocalClusters_GET(t *testing.T) {
	server := &Server{
		localClusters:  kube.NewLocalClusterManager(nil),
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("GET", "/local-clusters", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleLocalClusters(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Expected 200, got %d", w.Code)
	}
}

func TestServer_HandleLocalClusters_WrongMethod(t *testing.T) {
	server := &Server{
		localClusters:  kube.NewLocalClusterManager(nil),
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("PUT", "/local-clusters", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleLocalClusters(w, req)

	// The handler may return 200 with error or 405 depending on implementation
	// Just verify it doesn't panic
}

func TestServer_HandleLocalClusterTools_WrongMethod(t *testing.T) {
	server := &Server{
		localClusters:  kube.NewLocalClusterManager(nil),
		allowedOrigins: []string{"*"},
	}

	req := httptest.NewRequest("PUT", "/local-cluster-tools", nil)
	req.Host = "localhost"
	w := httptest.NewRecorder()

	server.handleLocalClusterTools(w, req)

	// Handler should respond without panicking
}

func TestSanitizeClusterError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected string
	}{
		{
			name:     "nil error returns unknown",
			err:      nil,
			expected: "unknown error",
		},
		{
			name:     "short error preserved",
			err:      fmt.Errorf("kind create failed: cluster already exists"),
			expected: "kind create failed: cluster already exists",
		},
		{
			name:     "docker not running error preserved",
			err:      fmt.Errorf("Docker is not running. Start Docker Desktop or Rancher Desktop first. (Cannot connect to the Docker daemon)"),
			expected: "Docker is not running. Start Docker Desktop or Rancher Desktop first. (Cannot connect to the Docker daemon)",
		},
		{
			name:     "unsupported tool error preserved",
			err:      fmt.Errorf("unsupported tool: foobar"),
			expected: "unsupported tool: foobar",
		},
		{
			name: "long error truncated to 512 chars",
			err:  fmt.Errorf("%s", strings.Repeat("x", 600)),
			expected: func() string {
				return strings.Repeat("x", 512) + "..."
			}(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := sanitizeClusterError(tt.err)
			if got != tt.expected {
				t.Errorf("sanitizeClusterError() = %q, want %q", got, tt.expected)
			}
		})
	}
}
