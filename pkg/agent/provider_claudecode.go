package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

// claudeCodeResponse represents the JSON output from claude CLI
type claudeCodeResponse struct {
	Type    string `json:"type"`
	Result  string `json:"result"`
	IsError bool   `json:"is_error"`
	Usage   struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
	} `json:"usage"`
}

// ClaudeCodeProvider uses the local Claude Code CLI installation
type ClaudeCodeProvider struct {
	cliPath string
	version string
}

// NewClaudeCodeProvider creates a new Claude Code CLI provider
func NewClaudeCodeProvider() *ClaudeCodeProvider {
	provider := &ClaudeCodeProvider{}
	provider.detectCLI()
	return provider
}

// detectCLI checks if claude CLI is installed and gets its version
func (c *ClaudeCodeProvider) detectCLI() {
	// Try to find claude in PATH first
	path, err := exec.LookPath("claude")
	if err != nil {
		// Check common installation locations
		commonPaths := []string{
			os.ExpandEnv("$HOME/.local/bin/claude"),
			"/usr/local/bin/claude",
			"/opt/homebrew/bin/claude",
			os.ExpandEnv("$HOME/.claude/local/claude"),
		}
		for _, p := range commonPaths {
			if _, statErr := os.Stat(p); statErr == nil {
				path = p
				log.Printf("Found Claude Code CLI at: %s", p)
				break
			}
		}
		if path == "" {
			log.Printf("Claude Code CLI not found in PATH or common locations")
			return
		}
	} else {
		log.Printf("Found Claude Code CLI in PATH: %s", path)
	}
	c.cliPath = path

	// Get version
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, "--version")
	output, err := cmd.Output()
	if err == nil {
		c.version = strings.TrimSpace(string(output))
		log.Printf("Claude Code CLI version: %s", c.version)
	} else {
		log.Printf("Could not get Claude Code CLI version: %v", err)
	}
}

// Name returns the provider identifier
func (c *ClaudeCodeProvider) Name() string {
	return "claude-code"
}

// DisplayName returns the human-readable name
func (c *ClaudeCodeProvider) DisplayName() string {
	return "Claude Code (Local)"
}

// Description returns the provider description
func (c *ClaudeCodeProvider) Description() string {
	if c.version != "" {
		return fmt.Sprintf("Local CLI with MCP tools - %s", c.version)
	}
	return "Local Claude Code CLI with MCP tools and hooks"
}

// Provider returns the provider type for icon selection
func (c *ClaudeCodeProvider) Provider() string {
	return "anthropic-local"
}

// IsAvailable returns true if the CLI is installed
func (c *ClaudeCodeProvider) IsAvailable() bool {
	return c.cliPath != ""
}

// buildPromptWithHistory creates a prompt that includes conversation history for context
func (c *ClaudeCodeProvider) buildPromptWithHistory(req *ChatRequest) string {
	if len(req.History) == 0 {
		return req.Prompt
	}

	// Build a prompt that includes history for context
	var sb strings.Builder
	sb.WriteString("Previous conversation for context:\n\n")

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

	sb.WriteString("---\n\nNow respond to the user's latest message:\n\n")
	sb.WriteString("User: ")
	sb.WriteString(req.Prompt)

	return sb.String()
}

// Chat executes a prompt using the Claude Code CLI
func (c *ClaudeCodeProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if c.cliPath == "" {
		return nil, fmt.Errorf("claude CLI not found")
	}

	// Build prompt with history for context
	fullPrompt := c.buildPromptWithHistory(req)

	// Build command with print mode (-p) for non-interactive use
	// -p is a boolean flag, prompt is positional argument at the end
	// Use --output-format json to get token usage
	args := []string{
		"-p",
		"--output-format", "json",
		fullPrompt, // Prompt must be positional argument
	}

	cmd := exec.CommandContext(ctx, c.cliPath, args...)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Set a reasonable timeout (5 minutes for complex operations)
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
	}

	err := cmd.Run()
	if err != nil {
		// Include stderr in error message for debugging
		errMsg := err.Error()
		if stderr.Len() > 0 {
			errMsg = fmt.Sprintf("%s: %s", errMsg, stderr.String())
		}
		return nil, fmt.Errorf("claude CLI error: %s", errMsg)
	}

	output := stdout.String()
	if output == "" && stderr.Len() > 0 {
		// Sometimes output goes to stderr
		output = stderr.String()
	}

	// Parse JSON response to extract content and token usage
	var cliResp claudeCodeResponse
	var content string
	var inputTokens, outputTokens int

	if err := json.Unmarshal([]byte(output), &cliResp); err != nil {
		// Fall back to raw output if JSON parsing fails
		log.Printf("Warning: failed to parse claude CLI JSON response: %v", err)
		content = strings.TrimSpace(output)
	} else {
		content = cliResp.Result
		// Total input includes cache tokens
		inputTokens = cliResp.Usage.InputTokens + cliResp.Usage.CacheCreationInputTokens + cliResp.Usage.CacheReadInputTokens
		outputTokens = cliResp.Usage.OutputTokens
	}

	return &ChatResponse{
		Content: content,
		Agent:   c.Name(),
		TokenUsage: &ProviderTokenUsage{
			InputTokens:  inputTokens,
			OutputTokens: outputTokens,
			TotalTokens:  inputTokens + outputTokens,
		},
		Done: true,
	}, nil
}

// StreamChat streams responses - for CLI we just return the full response
func (c *ClaudeCodeProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	// CLI doesn't support true streaming, so we execute and return the full response
	resp, err := c.Chat(ctx, req)
	if err != nil {
		return nil, err
	}

	// Send the complete response as a single chunk
	onChunk(resp.Content)

	return resp, nil
}

// Refresh re-detects the CLI (useful if user installs it after startup)
func (c *ClaudeCodeProvider) Refresh() {
	c.detectCLI()
}
