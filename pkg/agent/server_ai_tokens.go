package agent

import (
	"fmt"
	"strings"

	"github.com/kubestellar/console/pkg/agent/protocol"
	"github.com/kubestellar/console/pkg/ai"
)

func (s *Server) checkClaudeAvailable() bool {
	return s.registry.HasAvailableProviders()
}

// getClaudeInfo returns AI provider info (for backward compatibility)
func (s *Server) getClaudeInfo() *protocol.ClaudeInfo {
	if !s.registry.HasAvailableProviders() {
		return nil
	}

	available := s.registry.ListAvailable()
	var providerNames []string
	for _, p := range available {
		providerNames = append(providerNames, p.DisplayName)
	}

	var sessionIn, sessionOut, todayIn, todayOut int64
	if s.tokens != nil {
		sessionIn, sessionOut, todayIn, todayOut = s.tokens.GetUsage()
	}

	return &protocol.ClaudeInfo{
		Installed: true,
		Version:   fmt.Sprintf("Multi-agent: %s", strings.Join(providerNames, ", ")),
		TokenUsage: protocol.TokenUsage{
			Session: protocol.TokenCount{
				Input:  sessionIn,
				Output: sessionOut,
			},
			Today: protocol.TokenCount{
				Input:  todayIn,
				Output: todayOut,
			},
		},
	}
}

// isSessionQuotaExceeded delegates to the token tracker.
func (s *Server) isSessionQuotaExceeded() bool {
	if s.tokens == nil {
		return false
	}
	return s.tokens.IsQuotaExceeded()
}

// sessionTokenQuotaMessage delegates to the token tracker.
func (s *Server) sessionTokenQuotaMessage() string {
	if s.tokens == nil {
		return ""
	}
	return s.tokens.QuotaMessage()
}

// addTokenUsage delegates to the token tracker.
func (s *Server) addTokenUsage(usage *ai.ProviderTokenUsage) {
	if s.tokens != nil {
		s.tokens.AddUsage(usage)
	}
}

// extractCommandsFromResponse parses an LLM thinking response to find
// executable commands. It handles multiple formats (#9440):
//   - Lines prefixed with "CMD: ", "CMD:", "Command: ", "command:" (case-insensitive)
//   - kubectl/helm/oc commands inside markdown fenced code blocks (```...```)
//   - Bare kubectl/helm/oc commands on standalone lines
func extractCommandsFromResponse(content string) []string {
	var commands []string
	seen := make(map[string]bool)
	inCodeBlock := false

	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)

		if strings.HasPrefix(trimmed, "```") {
			inCodeBlock = !inCodeBlock
			continue
		}

		if m := cmdPrefixRe.FindStringSubmatch(trimmed); m != nil {
			cmd := strings.TrimSpace(m[1])
			if cmd != "" && !seen[cmd] {
				seen[cmd] = true
				commands = append(commands, cmd)
			}
			continue
		}

		if inCodeBlock {
			if codeBlockCmdRe.MatchString(trimmed) && !seen[trimmed] {
				seen[trimmed] = true
				commands = append(commands, trimmed)
			}
			continue
		}

		if codeBlockCmdRe.MatchString(trimmed) && !seen[trimmed] {
			seen[trimmed] = true
			commands = append(commands, trimmed)
		}
	}

	return commands
}

// KeyStatus represents the status of an API key for a provider
type KeyStatus struct {
	Provider      string `json:"provider"`
	DisplayName   string `json:"displayName"`
	Configured    bool   `json:"configured"`
	Source        string `json:"source,omitempty"`
	Valid         *bool  `json:"valid,omitempty"`
	Error         string `json:"error,omitempty"`
	BaseURL       string `json:"baseURL,omitempty"`
	BaseURLEnvVar string `json:"baseURLEnvVar,omitempty"`
	BaseURLSource string `json:"baseURLSource,omitempty"`
}

// KeysStatusResponse is the response for GET /settings/keys.
type KeysStatusResponse struct {
	Keys                []KeyStatus       `json:"keys"`
	ConfigPath          string            `json:"configPath"`
	RegisteredProviders []ai.ProviderInfo `json:"registeredProviders"`
}

// SetKeyRequest is the request body for POST /settings/keys.
type SetKeyRequest struct {
	Provider     string `json:"provider"`
	APIKey       string `json:"apiKey,omitempty"`
	Model        string `json:"model,omitempty"`
	BaseURL      string `json:"baseURL,omitempty"`
	ClearBaseURL bool   `json:"clearBaseURL,omitempty"`
}
