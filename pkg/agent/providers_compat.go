package agent

import (
	"os/exec"
	"net/http"
	"time"

	"github.com/kubestellar/console/pkg/agent/providers"
)

// Re-export provider constants used by server files.
const (
	ProviderKeyOllama   = providers.ProviderKeyOllama
	ProviderKeyLlamaCpp = providers.ProviderKeyLlamaCpp
	ProviderKeyLocalAI  = providers.ProviderKeyLocalAI
	ProviderKeyVLLM     = providers.ProviderKeyVLLM
	ProviderKeyLMStudio = providers.ProviderKeyLMStudio
	ProviderKeyRHAIIS   = providers.ProviderKeyRHAIIS

	kagentiK8sContextKey = providers.KagentiK8sContextKey
	maxLLMResponseBytes  = providers.MaxLLMResponseBytes
)

var (
	defaultOllamaURL   = providers.DefaultOllamaURL
	defaultLMStudioURL = providers.DefaultLMStudioURL
	claudeAPIVersion   = providers.ClaudeAPIVersion
	geminiAPIBaseURL   = providers.GeminiAPIBaseURL
)

func newRestrictedAIProviderHTTPClient(timeout time.Duration) *http.Client {
	return providers.NewRestrictedAIProviderHTTPClient(timeout)
}

func groqValidationURL() string { return providers.GroqValidationURL() }

func truncateString(s string, maxLen int) string { return providers.TruncateString(s, maxLen) }


// allowLoopbackForTests is a package-level alias that sets the providers flag.
// nolint: unused — referenced by main_test.go via go:linkname or TestMain.

// SetAllowLoopbackForTests enables/disables loopback in tests.
func SetAllowLoopbackForTests(v bool) {
	providers.AllowLoopbackForTests = v
}



// execCommand and execCommandContext exist for test mocking in
// server_gitops_test.go. They mirror providers.ExecCommand/Context.
var (
	execCommand        = exec.Command
	execCommandContext = exec.CommandContext
)
