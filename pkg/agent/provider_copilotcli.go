package agent

import (
	"bufio"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

// CopilotCLIProvider implements the AIProvider and StreamingProvider interfaces
// for GitHub Copilot CLI, providing real-time streaming responses.
type CopilotCLIProvider struct {
	cliPath string
	version string
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
func (c *CopilotCLIProvider) StreamChatWithProgress(ctx context.Context, req *ChatRequest, onChunk func(chunk string), onProgress func(event StreamEvent)) (*ChatResponse, error) {
	if c.cliPath == "" {
		return nil, fmt.Errorf("copilot CLI not found")
	}

	prompt := buildPromptWithHistoryGeneric(req)
	log.Printf("[CopilotCLI] Starting with prompt length=%d", len(prompt))

	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
	}

	// --silent: only output agent response (no usage stats)
	// --no-ask-user: disable interactive prompts that would block
	// --no-color: disable ANSI color codes
	cmd := exec.CommandContext(ctx, c.cliPath, "-p", prompt, "--silent", "--no-ask-user", "--no-color")
	cmd.Env = append(os.Environ(), "NO_COLOR=1")

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
	log.Printf("[CopilotCLI] Process started (PID=%d)", cmd.Process.Pid)

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

	if scanErr := scanner.Err(); scanErr != nil {
		log.Printf("[CopilotCLI] Scanner error: %v", scanErr)
	}

	waitErr := cmd.Wait()
	if waitErr != nil {
		log.Printf("[CopilotCLI] Command finished with error: %v", waitErr)
		if se := stderrContent.String(); se != "" {
			log.Printf("[CopilotCLI] stderr: %s", se)
		}
	}

	log.Printf("[CopilotCLI] Completed: %d lines, %d bytes", lineCount, fullResponse.Len())

	content := fullResponse.String()

	// If stdout was empty but stderr has content, the CLI may have failed
	if content == "" && waitErr != nil {
		errMsg := stderrContent.String()
		if errMsg != "" {
			return nil, fmt.Errorf("copilot CLI failed: %s", strings.TrimSpace(errMsg))
		}
		return nil, fmt.Errorf("copilot CLI returned empty response (exit: %v)", waitErr)
	}

	if onProgress != nil {
		onProgress(StreamEvent{
			Type: "tool_result",
			Tool: "copilot-cli",
		})
	}

	return &ChatResponse{
		Content: content,
		Agent:   c.Name(),
		Done:    true,
	}, nil
}
