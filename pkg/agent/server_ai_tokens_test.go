package agent

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
	"time"
)

func TestServer_TokenUsageDebounce(t *testing.T) {
	// Setup temp home for token usage file
	tmpDir, err := os.MkdirTemp("", "agent-tokens-*")
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
	s.tokenMux.RUnlock()

	// 2. Verify file NOT written immediately (debounce)
	path := getTokenUsagePath()
	if _, err := os.Stat(path); err == nil {
		t.Error("Token usage file should not be written immediately due to debounce")
	}

	// 3. Force save
	s.saveTokenUsage()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("Failed to read usage file: %v", err)
	}

	var saved tokenUsageData
	if err := json.Unmarshal(data, &saved); err != nil {
		t.Fatalf("Failed to unmarshal usage data: %v", err)
	}

	if saved.InputIn != 100 || saved.OutputOut != 50 {
		t.Errorf("Expected 100/50 in file, got %d/%d", saved.InputIn, saved.OutputOut)
	}
}

func TestServer_SessionQuota(t *testing.T) {
	s := &Server{
		sessionTokenQuota: 500,
	}

	if s.isSessionQuotaExceeded() {
		t.Fatal("Quota should not be exceeded initially")
	}

	// Add usage under quota
	s.addTokenUsage(&ProviderTokenUsage{InputTokens: 200, OutputTokens: 200})
	if s.isSessionQuotaExceeded() {
		t.Fatal("Quota should not be exceeded at 400/500")
	}

	// Add usage over quota
	s.addTokenUsage(&ProviderTokenUsage{InputTokens: 100, OutputTokens: 1})
	if !s.isSessionQuotaExceeded() {
		t.Fatal("Quota should be exceeded at 501/500")
	}

	msg := s.sessionTokenQuotaMessage()
	if !contains(msg, "Session token quota exceeded") {
		t.Errorf("Unexpected quota message: %s", msg)
	}
}

func TestExtractCommands(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{
			"CMD prefix",
			"CMD: kubectl get pods",
			[]string{"kubectl get pods"},
		},
		{
			"Markdown block",
			"```bash\nhelm install my-app .\n```",
			[]string{"helm install my-app ."},
		},
		{
			"Bare command",
			"You should run\nkubectl describe pod foo\nto see details.",
			[]string{"kubectl describe pod foo"},
		},
		{
			"Multiple commands",
			"CMD: oc login\n```\nkubectl get nodes\n```\nhelm list",
			[]string{"oc login", "kubectl get nodes", "helm list"},
		},
		{
			"Empty string",
			"",
			nil,
		},
		{
			"No commands in text",
			"This is just a description of what happened.\nNothing to execute here.",
			nil,
		},
		{
			"Duplicate suppression",
			"CMD: kubectl get pods\nkubectl get pods",
			[]string{"kubectl get pods"},
		},
		{
			"Case insensitive CMD prefix",
			"command: kubectl apply -f deploy.yaml",
			[]string{"kubectl apply -f deploy.yaml"},
		},
		{
			"CMD prefix no space after colon",
			"CMD:kubectl get ns",
			[]string{"kubectl get ns"},
		},
		{
			"Multiple code blocks",
			"First:\n```\nkubectl get pods\n```\nSecond:\n```\nhelm status my-app\n```",
			[]string{"kubectl get pods", "helm status my-app"},
		},
		{
			"Non-kubectl in code block ignored",
			"```\necho hello\nls -la\n```",
			nil,
		},
		{
			"oc commands detected",
			"oc get routes -A",
			[]string{"oc get routes -A"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractCommandsFromResponse(tt.input)
			if len(got) != len(tt.expected) {
				t.Fatalf("Expected %d commands, got %d: %v", len(tt.expected), len(got), got)
			}
			for i, cmd := range got {
				if cmd != tt.expected[i] {
					t.Errorf("cmd[%d] = %q, want %q", i, cmd, tt.expected[i])
				}
			}
		})
	}
}

func contains(s, substr string) bool {
	return strings.Contains(s, substr)
}
