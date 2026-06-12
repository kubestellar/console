package agent

import (
	"context"
	"crypto/tls"
	"fmt"
	"math"
	"net"
	"net/http"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

const aiProviderHTTPTimeout = 120 * time.Second // timeout for AI provider API calls
const aiProviderDialTimeout = 30 * time.Second
const aiProviderDNSLookupTimeout = 3 * time.Second

// allowLoopbackForTests disables the private-IP check for loopback addresses
// during unit tests that use httptest.NewServer. Must never be set in production.
var allowLoopbackForTests bool

// cliProviderExecutionTimeout bounds standalone CLI-based providers when the
// caller has not already attached a deadline.
const cliProviderExecutionTimeout = 5 * time.Minute

// execCommand allows mocking exec.Command for testing
var execCommand = exec.Command

// execCommandContext allows mocking exec.CommandContext for testing
var execCommandContext = exec.CommandContext

// fakeExecCommandContext is a test helper for mocking exec.CommandContext
var fakeExecCommandContext func(context.Context, string, ...string) *exec.Cmd

// aiProviderHTTPClient is reused across AI provider API calls to enable
// connection pooling and reduce per-request allocation overhead.
var aiProviderHTTPClient = newRestrictedAIProviderHTTPClient(aiProviderHTTPTimeout)

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

func newRestrictedAIProviderHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout:       timeout,
		Transport:     newRestrictedAIProviderHTTPTransport(),
		CheckRedirect: preventAIProviderRedirects,
	}
}

func newRestrictedAIProviderHTTPTransport() *http.Transport {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	dialer := &net.Dialer{Timeout: aiProviderDialTimeout}

	transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return dialAIProviderContext(ctx, dialer, network, addr)
	}
	transport.DialTLSContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
		return dialAIProviderTLSContext(ctx, dialer, network, addr, transport.TLSClientConfig)
	}

	return transport
}

func preventAIProviderRedirects(_ *http.Request, _ []*http.Request) error {
	return http.ErrUseLastResponse
}

func dialAIProviderContext(ctx context.Context, dialer *net.Dialer, network, addr string) (net.Conn, error) {
	if allowLocalProviders() {
		return dialer.DialContext(ctx, network, addr)
	}

	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("invalid provider address %q: %w", addr, err)
	}

	targets, err := resolveAIProviderTargets(ctx, host, port)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for _, target := range targets {
		conn, dialErr := dialer.DialContext(ctx, network, target)
		if dialErr == nil {
			return conn, nil
		}
		lastErr = dialErr
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no provider addresses resolved for host %q", host)
}

func dialAIProviderTLSContext(ctx context.Context, dialer *net.Dialer, network, addr string, baseTLSConfig *tls.Config) (net.Conn, error) {
	if allowLocalProviders() {
		tlsDialer := &tls.Dialer{NetDialer: dialer, Config: cloneTLSConfig(baseTLSConfig)}
		return tlsDialer.DialContext(ctx, network, addr)
	}

	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, fmt.Errorf("invalid provider address %q: %w", addr, err)
	}

	targets, err := resolveAIProviderTargets(ctx, host, port)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for _, target := range targets {
		tlsConfig := cloneTLSConfig(baseTLSConfig)
		if tlsConfig.ServerName == "" {
			tlsConfig.ServerName = host
		}
		tlsDialer := &tls.Dialer{NetDialer: dialer, Config: tlsConfig}
		conn, dialErr := tlsDialer.DialContext(ctx, network, target)
		if dialErr == nil {
			return conn, nil
		}
		lastErr = dialErr
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no provider addresses resolved for host %q", host)
}

func resolveAIProviderTargets(ctx context.Context, host, port string) ([]string, error) {
	lookupCtx, cancel := context.WithTimeout(ctx, aiProviderDNSLookupTimeout)
	defer cancel()

	ipAddrs, err := net.DefaultResolver.LookupIPAddr(lookupCtx, host)
	if err != nil {
		if ip := net.ParseIP(host); ip != nil {
			if isPrivateIP(ip) && !(allowLoopbackForTests && ip.IsLoopback()) {
				return nil, fmt.Errorf("provider request blocked: host %q resolves to a private/internal IP address", host)
			}
			return []string{net.JoinHostPort(ip.String(), port)}, nil
		}
		return nil, err
	}

	targets := make([]string, 0, len(ipAddrs))
	for _, ipAddr := range ipAddrs {
		if isPrivateIP(ipAddr.IP) && !(allowLoopbackForTests && ipAddr.IP.IsLoopback()) {
			return nil, fmt.Errorf("provider request blocked: host %q resolves to a private/internal IP address", host)
		}
		targets = append(targets, net.JoinHostPort(ipAddr.IP.String(), port))
	}
	return targets, nil
}

func cloneTLSConfig(base *tls.Config) *tls.Config {
	if base == nil {
		return &tls.Config{
			MinVersion: tls.VersionTLS12,
		}
	}
	cloned := base.Clone()
	if cloned.MinVersion == 0 {
		cloned.MinVersion = tls.VersionTLS12
	}
	return cloned
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
