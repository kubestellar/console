package handlers

import (
	"regexp"

	"github.com/kubestellar/console/pkg/agent"
)

var safePromptToolNameRe = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)

func sanitizePromptToolName(toolName string) (string, bool) {
	if !safePromptToolNameRe.MatchString(toolName) {
		return "", false
	}

	return agent.SanitizeK8sStringForPrompt(toolName), true
}
