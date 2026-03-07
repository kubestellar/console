package agent

import (
	"net/http"
	"strings"
	"time"
)

const aiProviderHTTPTimeout = 120 * time.Second // timeout for AI provider API calls

// newAIProviderHTTPClient creates an HTTP client configured with the standard
// timeout for AI provider API calls.
func newAIProviderHTTPClient() *http.Client {
	return &http.Client{Timeout: aiProviderHTTPTimeout}
}

// buildPromptWithHistoryGeneric creates a prompt string from a ChatRequest
// including system prompt and conversation history.
// Used by CLI-based providers that take a single prompt string.
func buildPromptWithHistoryGeneric(req *ChatRequest) string {
	var sb strings.Builder

	systemPrompt := req.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = DefaultSystemPrompt
	}

	sb.WriteString("System: ")
	sb.WriteString(systemPrompt)
	sb.WriteString("\n\n")

	for _, msg := range req.History {
		switch msg.Role {
		case "user":
			sb.WriteString("User: ")
		case "assistant":
			sb.WriteString("Assistant: ")
		case "system":
			sb.WriteString("System: ")
		}
		sb.WriteString(msg.Content)
		sb.WriteString("\n\n")
	}

	sb.WriteString("User: ")
	sb.WriteString(req.Prompt)
	return sb.String()
}
