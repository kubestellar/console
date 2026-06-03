package agent

import (
	"context"
	"fmt"
	"math"
	"net"
	"net/http"
	"regexp"
	"strings"
	"syscall"
	"time"
)

const aiProviderHTTPTimeout = 120 * time.Second // timeout for AI provider API calls

// cliProviderExecutionTimeout bounds standalone CLI-based providers when the
// caller has not already attached a deadline.
const cliProviderExecutionTimeout = 5 * time.Minute

// ssrfSafeDialer is a net.Dialer that rejects connections to private/link-local
// IP addresses at connect time. This prevents DNS rebinding attacks where a
// hostname resolves to a public IP at validation time but re-resolves to an
// internal IP at request time (CWE-918, #16902).
var ssrfSafeDialer = &net.Dialer{
	Timeout:   30 * time.Second,
	KeepAlive: 30 * time.Second,
	Control:   ssrfDialControl,
}

// ssrfDialControl is a socket control function that inspects the resolved
// address before the connection is established and rejects private IPs.
func ssrfDialControl(network, address string, _ syscall.RawConn) error {
	if allowLocalProviders() {
		return nil
	}
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("SSRF guard: cannot parse address %q: %w", address, err)
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return fmt.Errorf("SSRF guard: invalid IP %q", host)
	}
	if isPrivateIP(ip) {
		return fmt.Errorf("SSRF guard: connection to private IP %s blocked (CWE-918)", ip)
	}
	return nil
}

// ssrfSafeTransport is an http.Transport that uses ssrfSafeDialer to block
// connections to internal/private networks and disables automatic redirects
// validation (handled at the client level).
var ssrfSafeTransport = &http.Transport{
	DialContext:         ssrfSafeDialer.DialContext,
	MaxIdleConns:        100,
	IdleConnTimeout:     90 * time.Second,
	TLSHandshakeTimeout: 10 * time.Second,
}

// ssrfCheckRedirect validates that redirect targets do not point to private IPs.
func ssrfCheckRedirect(req *http.Request, via []*http.Request) error {
	const maxRedirects = 10
	if len(via) >= maxRedirects {
		return fmt.Errorf("stopped after %d redirects", maxRedirects)
	}
	if allowLocalProviders() {
		return nil
	}
	host := req.URL.Hostname()
	ctx, cancel := context.WithTimeout(req.Context(), 3*time.Second)
	defer cancel()
	ips, err := net.DefaultResolver.LookupHost(ctx, host)
	if err != nil {
		// If it's a literal IP, check directly
		if ip := net.ParseIP(host); ip != nil {
			if isPrivateIP(ip) {
				return fmt.Errorf("SSRF guard: redirect to private IP %s blocked", ip)
			}
			return nil
		}
		// DNS failed — fail closed
		return fmt.Errorf("SSRF guard: cannot resolve redirect target %q: %w", host, err)
	}
	for _, ipStr := range ips {
		if ip := net.ParseIP(ipStr); ip != nil && isPrivateIP(ip) {
			return fmt.Errorf("SSRF guard: redirect to private IP %s blocked", ip)
		}
	}
	return nil
}

// aiProviderHTTPClient is reused across AI provider API calls to enable
// connection pooling and reduce per-request allocation overhead. It uses an
// SSRF-safe transport that rejects connections to private/internal IPs at
// dial time, preventing DNS rebinding attacks (CWE-918, #16902).
var aiProviderHTTPClient = &http.Client{
	Timeout:       aiProviderHTTPTimeout,
	Transport:     ssrfSafeTransport,
	CheckRedirect: ssrfCheckRedirect,
}

var explicitNegativeConstraintPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bdo not [^.!?\n]*(?:desktop app|desktop|gui|window|ide|editor)\b[^.!?\n]*`),
	regexp.MustCompile(`(?i)\bdon't [^.!?\n]*(?:desktop app|desktop|gui|window|ide|editor)\b[^.!?\n]*`),
	regexp.MustCompile(`(?i)\bwithout opening [^.!?\n]*(?:desktop app|desktop|gui|window|ide|editor)\b[^.!?\n]*`),
	regexp.MustCompile(`(?i)\b(?:stay|keep(?: it)?) in the terminal\b[^.!?\n]*`),
	regexp.MustCompile(`(?i)\bdo not leave the terminal\b[^.!?\n]*`),
	regexp.MustCompile(`(?i)\bterminal only\b[^.!?\n]*`),
}

// estimatedCharsPerToken is the industry-standard rule-of-thumb used by
// OpenAI, Anthropic, and Google to convert character counts to approximate
// token counts when an exact tokenizer is unavailable. For English text and
// the most common code/markdown payloads we exchange with AI agents, this
// typically lands within 10–20% of the true token count from the model's
// own tokenizer. CLI-based providers (Gemini CLI, Copilot CLI, etc.) do not
// expose token usage in their stdout, so we rely on this estimator to
// populate the navbar token-usage indicator. See issue #9160.
const estimatedCharsPerToken = 4
const maxProviderPreallocationSize = math.MaxInt

// safeProviderPreallocationSize guards capacity hints used for slices/maps so
// len(x)+n arithmetic never overflows into an invalid allocation size.
func safeProviderPreallocationSize(base int, extra int) int {
	if base < 0 || extra < 0 || base > maxProviderPreallocationSize-extra {
		return 0
	}
	return base + extra
}

// estimateTokensFromText returns an approximate token count for the given
// text using a 4-chars-per-token heuristic. Returns 0 for the empty string
// so callers can use the result directly without a length guard.
//
// This is intentionally a *very* rough estimate — the goal is to give the
// user a non-zero, monotonically-increasing signal in the token-usage
// indicator for CLI-based providers that do not report exact counts. For
// budget-precise accounting users should configure the corresponding API
// provider (Gemini API instead of Gemini CLI) which returns exact counts
// from the model's own tokenizer.
func estimateTokensFromText(s string) int {
	if s == "" {
		return 0
	}
	// ceil(len(s)/estimatedCharsPerToken) so a single character still
	// counts as one token rather than zero.
	return (len(s) + estimatedCharsPerToken - 1) / estimatedCharsPerToken
}

// estimateChatTokenUsage builds a ProviderTokenUsage from the request
// prompt+history and the response content using estimateTokensFromText.
// Used by CLI-based providers that have no native token-usage reporting so
// the navbar token-usage indicator increments for these agents too (#9160).
func estimateChatTokenUsage(req *ChatRequest, responseContent string) *ProviderTokenUsage {
	if req == nil {
		// Without a request we can still attribute output tokens.
		out := estimateTokensFromText(responseContent)
		return &ProviderTokenUsage{
			InputTokens:  0,
			OutputTokens: out,
			TotalTokens:  out,
		}
	}
	inputText := buildPromptWithHistoryGeneric(req)
	in := estimateTokensFromText(inputText)
	out := estimateTokensFromText(responseContent)
	return &ProviderTokenUsage{
		InputTokens:  in,
		OutputTokens: out,
		TotalTokens:  in + out,
	}
}

// newAIProviderHTTPClient returns the shared HTTP client configured with the
// standard timeout for AI provider API calls.
func newAIProviderHTTPClient() *http.Client {
	return aiProviderHTTPClient
}

func collectExplicitNegativeConstraints(req *ChatRequest) []string {
	if req == nil {
		return nil
	}

	sources := []string{req.Prompt}
	for _, msg := range req.History {
		if msg.Role == "user" {
			sources = append(sources, msg.Content)
		}
	}

	constraints := make([]string, 0)
	seen := make(map[string]struct{})
	for _, source := range sources {
		for _, pattern := range explicitNegativeConstraintPatterns {
			matches := pattern.FindAllString(source, -1)
			for _, match := range matches {
				normalized := strings.TrimSpace(strings.Join(strings.Fields(match), " "))
				if normalized == "" {
					continue
				}
				key := strings.ToLower(normalized)
				if _, exists := seen[key]; exists {
					continue
				}
				seen[key] = struct{}{}
				constraints = append(constraints, normalized)
			}
		}
	}

	return constraints
}

func buildExplicitNegativeConstraintBlock(req *ChatRequest) string {
	constraints := collectExplicitNegativeConstraints(req)
	if len(constraints) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("CRITICAL USER CONSTRAINTS:\n")
	for _, constraint := range constraints {
		sb.WriteString("- ")
		sb.WriteString(constraint)
		sb.WriteString("\n")
	}
	sb.WriteString("These are hard requirements. Do not ignore them. If you cannot comply, say so and do not perform the forbidden action.")
	return sb.String()
}

func requestForbidsDesktopCompanion(req *ChatRequest) bool {
	return len(collectExplicitNegativeConstraints(req)) > 0
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
	if constraintBlock := buildExplicitNegativeConstraintBlock(req); constraintBlock != "" {
		sb.WriteString(constraintBlock)
		sb.WriteString("\n\n")
	}

	for _, msg := range req.History {
		switch msg.Role {
		case "user":
			sb.WriteString("User: ")
		case "assistant":
			sb.WriteString("Assistant: ")
		case "system":
			sb.WriteString("System: ")
		default:
			// Use a generic label for unknown roles (e.g., "tool", "function")
			// so the prompt formatting remains correct.
			sb.WriteString("Unknown: ")
		}
		sb.WriteString(msg.Content)
		sb.WriteString("\n\n")
	}

	sb.WriteString("User: ")
	sb.WriteString(req.Prompt)
	return sb.String()
}
