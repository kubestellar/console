package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"

	"github.com/kubestellar/console/pkg/sanitize"
)

const toolInvocationPromptTemplate = "Please use the tool %s with args %s"

var errInvalidPromptToolName = errors.New("invalid tool name")
var safePromptToolNameRe = regexp.MustCompile(`^[a-zA-Z0-9._-]+$`)

func sanitizePromptToolName(toolName string) (string, bool) {
	if !safePromptToolNameRe.MatchString(toolName) {
		return "", false
	}

	return sanitize.PromptString(toolName), true
}

func buildToolInvocationPrompt(tool string, args map[string]any) (string, error) {
	sanitizedTool, ok := sanitizePromptToolName(tool)
	if !ok {
		return "", errInvalidPromptToolName
	}

	argsJSON, err := json.Marshal(args)
	if err != nil {
		return "", err
	}

	sanitizedArgs := sanitize.PromptString(string(argsJSON))
	return fmt.Sprintf(toolInvocationPromptTemplate, sanitizedTool, sanitizedArgs), nil
}
