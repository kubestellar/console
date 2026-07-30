package agent

import "github.com/kubestellar/console/pkg/agent/prompts"

// DefaultSystemPrompt is the default system prompt for KubeStellar console.
// Delegated to pkg/agent/prompts to prepare for future providers sub-package.
var DefaultSystemPrompt = prompts.DefaultSystemPrompt

// ChatOnlySystemPrompt is used for providers that only support text chat.
var ChatOnlySystemPrompt = prompts.ChatOnlySystemPrompt

// OSCommandHint returns a human-readable hint telling the AI which shell and
// package manager conventions to use.
func OSCommandHint() string {
	return prompts.OSCommandHint()
}

// OSContext returns a short string describing the current operating system.
func OSContext() string {
	return prompts.OSContext()
}
