package agent

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

// authRefreshCooldown prevents hammering `gh auth token` on repeated failures.
const authRefreshCooldown = 30 * time.Second

// CopilotCLIProvider implements the AIProvider and StreamingProvider interfaces
// for GitHub Copilot CLI, providing real-time streaming responses.
type CopilotCLIProvider struct {
	cliPath string
	version string

	// Token refresh state — guarded by authMu.
	authMu            sync.Mutex
	lastAuthRefresh   time.Time
	lastAuthRefreshOK bool
}

func NewCopilotCLIProvider() *CopilotCLIProvider {
	p := &CopilotCLIProvider{}
	p.detectCLI()
	return p
}

func (c *CopilotCLIProvider) detectCLI() {
	if path, err := exec.LookPath("copilot"); err == nil {
		c.cliPath = path
		c.detectVersion()
		return
	}

	// Check common installation paths
	paths := []string{
		"/usr/local/bin/copilot",
	}
	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			c.cliPath = p
			c.detectVersion()
			return
		}
	}
}

func (c *CopilotCLIProvider) detectVersion() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, c.cliPath, "--version").Output()
	if err == nil {
		ver := strings.TrimSpace(string(out))
		// Output is like "GitHub Copilot CLI 0.0.418.\nRun 'copilot update'..."
		// First drop the update notice line
		if idx := strings.Index(ver, "\n"); idx > 0 {
			ver = ver[:idx]
		}
		ver = strings.TrimPrefix(ver, "GitHub Copilot CLI ")
		ver = strings.TrimRight(ver, ".")
		c.version = strings.TrimSpace(ver)
	}
}

func (c *CopilotCLIProvider) Name() string        { return "copilot-cli" }
func (c *CopilotCLIProvider) DisplayName() string { return "Copilot CLI" }
func (c *CopilotCLIProvider) Provider() string    { return "github-cli" }
func (c *CopilotCLIProvider) Description() string {
	if c.version != "" {
		return fmt.Sprintf("GitHub Copilot CLI (v%s) - AI-powered terminal assistant by GitHub", c.version)
	}
	return "GitHub Copilot CLI - AI-powered terminal assistant by GitHub"
}
func (c *CopilotCLIProvider) IsAvailable() bool {
	return c.cliPath != ""
}
func (c *CopilotCLIProvider) Capabilities() ProviderCapability {
	return CapabilityChat | CapabilityToolExec
}

func (c *CopilotCLIProvider) Refresh() {
	c.detectCLI()
}

// isAuthError returns true when the error text indicates an expired or invalid
// GitHub / Copilot auth token.
func isAuthError(text string) bool {
	lower := strings.ToLower(text)
	return strings.Contains(lower, "login") ||
		strings.Contains(lower, "auth") ||
		strings.Contains(lower, "sign in") ||
		strings.Contains(lower, "token") ||
		strings.Contains(lower, "authenticate") ||
		strings.Contains(lower, "401") ||
		strings.Contains(lower, "403")
}

// refreshGitHubAuth attempts to obtain a fresh GitHub token by invoking
// `gh auth token`.  If the command succeeds the token file/keyring was
// already refreshed by the user (e.g. `gh auth refresh`) and subsequent
// copilot CLI invocations will pick it up automatically.
//
// The method is rate-limited by authRefreshCooldown so we don't spam the
// gh CLI on repeated failures.  Returns true when the refresh looks healthy.
func (c *CopilotCLIProvider) refreshGitHubAuth() bool {
	c.authMu.Lock()
	defer c.authMu.Unlock()

	if time.Since(c.lastAuthRefresh) < authRefreshCooldown {
		return c.lastAuthRefreshOK
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	out, err := exec.CommandContext(ctx, "gh", "auth", "token").Output()
	c.lastAuthRefresh = time.Now()
	if err != nil {
		slog.Warn("[CopilotCLI] gh auth token failed — token may still be expired", "error", err)
		c.lastAuthRefreshOK = false
		return false
	}
	tok := strings.TrimSpace(string(out))
	if tok == "" {
		slog.Warn("[CopilotCLI] gh auth token returned empty output")
		c.lastAuthRefreshOK = false
		return false
	}
	slog.Info("[CopilotCLI] gh auth token succeeded — fresh token available")
	c.lastAuthRefreshOK = true
	return true
}

// freshEnv returns a copy of the current process environment with any stale
// GH_TOKEN / GITHUB_TOKEN entries removed, plus NO_COLOR=1.  Removing these
// vars forces the copilot CLI to read the freshly-refreshed token from gh's
// config/keyring rather than using a stale value inherited from the kc-agent
// process environment at startup.
func freshEnv() []string {
	env := os.Environ()
	filtered := make([]string, 0, len(env)+1)
	for _, e := range env {
		upper := strings.ToUpper(e)
		if strings.HasPrefix(upper, "GH_TOKEN=") || strings.HasPrefix(upper, "GITHUB_TOKEN=") {
			continue
		}
		filtered = append(filtered, e)
	}
	return append(filtered, "NO_COLOR=1")
}

func (c *CopilotCLIProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	var result strings.Builder
	resp, err := c.StreamChatWithProgress(ctx, req, func(chunk string) {
		result.WriteString(chunk)
	}, nil)
	if err != nil {
		return nil, err
	}
	if resp.Content == "" {
		resp.Content = result.String()
	}
	return resp, nil
}

func (c *CopilotCLIProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	return c.StreamChatWithProgress(ctx, req, onChunk, nil)
}

// StreamChatWithProgress implements StreamingProvider for real-time streaming.
// On auth errors it attempts one automatic token refresh and retry (#11079).
func (c *CopilotCLIProvider) StreamChatWithProgress(ctx context.Context, req *ChatRequest, onChunk func(chunk string), onProgress func(event StreamEvent)) (*ChatResponse, error) {
	resp, err := c.doStreamChat(ctx, req, onChunk, onProgress)
	if err != nil && isAuthError(err.Error()) {
		slog.Info("[CopilotCLI] auth error detected — attempting token refresh", "error", err)
		if c.refreshGitHubAuth() {
			slog.Info("[CopilotCLI] retrying after token refresh")
			resp, err = c.doStreamChat(ctx, req, onChunk, onProgress)
		}
	}
	return resp, err
}

// doStreamChat performs a single invocation of the copilot CLI.
func (c *CopilotCLIProvider) doStreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string), onProgress func(event StreamEvent)) (*ChatResponse, error) {
	if c.cliPath == "" {
		return nil, fmt.Errorf("copilot CLI not found")
	}

	prompt := buildPromptWithHistoryGeneric(req)
	slog.Info("[CopilotCLI] starting", "promptLength", len(prompt))

	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
	}

	// --silent: only output agent response (no usage stats)
	// --no-ask-user: disable interactive prompts that would block
	// --no-color: disable ANSI color codes
	// --allow-all-tools: allow tool execution without confirmation (required for non-interactive mode)
	// --allow-all-paths: allow access to any file path for kubectl/helm operations
	cmd := exec.CommandContext(ctx, c.cliPath, "-p", prompt, "--silent", "--no-ask-user", "--no-color", "--allow-all-tools", "--allow-all-paths")
	cmd.Env = freshEnv()
	configureProcessGroup(cmd) // #9442: kill entire process tree on timeout

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if onProgress != nil {
		onProgress(StreamEvent{
			Type: "tool_use",
			Tool: "copilot-cli",
			Input: map[string]interface{}{
				"command": "copilot -p ...",
			},
		})
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start copilot CLI: %w", err)
	}
	slog.Info("[CopilotCLI] process started", "pid", cmd.Process.Pid)

	// Capture stderr in background for diagnostics
	var stderrContent strings.Builder
	go func() {
		sc := bufio.NewScanner(stderrPipe)
		for sc.Scan() {
			line := sc.Text()
			stderrContent.WriteString(line)
			stderrContent.WriteString("\n")
		}
	}()

	var fullResponse strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)
	lineCount := 0
	for scanner.Scan() {
		line := scanner.Text()
		lineCount++
		fullResponse.WriteString(line)
		fullResponse.WriteString("\n")
		if onChunk != nil {
			onChunk(line + "\n")
		}
	}

	scanErr := scanner.Err()
	if scanErr != nil {
		slog.Error("[CopilotCLI] scanner error", "error", scanErr)
	}

	waitErr := cmd.Wait()
	if waitErr != nil {
		slog.Error("[CopilotCLI] command finished with error", "error", waitErr)
		if se := stderrContent.String(); se != "" {
			slog.Info("[CopilotCLI] stderr output", "stderr", se)
		}
	}

	slog.Info("[CopilotCLI] completed", "lines", lineCount, "bytes", fullResponse.Len())

	content := fullResponse.String()

	// If stdout was empty but stderr has content, the CLI may have failed
	if content == "" && waitErr != nil {
		errMsg := strings.TrimSpace(stderrContent.String())
		if errMsg != "" {
			// Detect authentication/login prompts that require interactive input
			lower := strings.ToLower(errMsg)
			if strings.Contains(lower, "login") || strings.Contains(lower, "auth") ||
				strings.Contains(lower, "sign in") || strings.Contains(lower, "token") ||
				strings.Contains(lower, "authenticate") {
				return nil, fmt.Errorf("copilot CLI requires authentication. Please run 'gh auth login' in your own terminal first, then retry this mission. Error: %s", errMsg)
			}
			return nil, fmt.Errorf("copilot CLI failed: %s", errMsg)
		}
		return nil, fmt.Errorf("copilot CLI returned empty response (exit: %v)", waitErr)
	}

	if onProgress != nil {
		onProgress(StreamEvent{
			Type: "tool_result",
			Tool: "copilot-cli",
		})
	}

	resp := &ChatResponse{
		Content:   content,
		Agent:     c.Name(),
		Done:      true,
		Truncated: scanErr != nil, // scanner hit error — output may be incomplete (#7278)
		// Copilot CLI does not emit token usage in its stdout, so we estimate
		// from the input prompt and the captured output. Without this the
		// navbar token-usage indicator stays at 0 for the entire session
		// (#9160), which breaks budget visibility for Copilot users.
		TokenUsage: estimateChatTokenUsage(req, content),
	}
	// Populate exit code so callers can detect CLI failures (#7273)
	if exitErr, ok := waitErr.(*exec.ExitError); ok {
		resp.ExitCode = exitErr.ExitCode()
	}
	return resp, nil
}
