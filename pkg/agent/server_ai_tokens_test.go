package agent

import (
	"strings"
	"testing"

	"github.com/kubestellar/console/pkg/agent/tokentracker"
)

func TestServer_TokenUsageDebounce(t *testing.T) {
	// The debounce/flush logic is now in the tokentracker package.
	// Here we verify the Server delegation still works end-to-end.
	s := &Server{
		tokens: tokentracker.New(0),
	}

	s.addTokenUsage(&ProviderTokenUsage{
		InputTokens:  100,
		OutputTokens: 50,
		TotalTokens:  150,
	})

	sessionIn, sessionOut, _, _ := s.tokens.GetUsage()
	if sessionIn != 100 || sessionOut != 50 {
		t.Errorf("Expected 100/50 session tokens, got %d/%d", sessionIn, sessionOut)
	}
}

func TestServer_SessionQuota(t *testing.T) {
	s := &Server{
		tokens: tokentracker.New(500),
	}

	if s.isSessionQuotaExceeded() {
		t.Fatal("Quota should not be exceeded initially")
	}

	s.addTokenUsage(&ProviderTokenUsage{InputTokens: 200, OutputTokens: 200})
	if s.isSessionQuotaExceeded() {
		t.Fatal("Quota should not be exceeded at 400/500")
	}

	s.addTokenUsage(&ProviderTokenUsage{InputTokens: 100, OutputTokens: 1})
	if !s.isSessionQuotaExceeded() {
		t.Fatal("Quota should be exceeded at 501/500")
	}

	msg := s.sessionTokenQuotaMessage()
	if !strings.Contains(msg, "KC_SESSION_TOKEN_QUOTA") {
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
