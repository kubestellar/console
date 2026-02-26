package agent

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

// claudeCodeStreamEvent represents events in Claude Code CLI stream-json output
type claudeCodeStreamEvent struct {
	Type    string `json:"type"`
	Subtype string `json:"subtype,omitempty"`

	// For tool_use events
	Tool  string         `json:"tool,omitempty"`
	Input map[string]any `json:"input,omitempty"`

	// For tool_result events
	Output string `json:"output,omitempty"`

	// For assistant/user message events
	Message *struct {
		Content []struct {
			Type      string `json:"type"`
			Text      string `json:"text,omitempty"`
			Content   string `json:"content,omitempty"`   // Tool result content
			ToolUseID string `json:"tool_use_id,omitempty"` // For tool results
		} `json:"content,omitempty"`
		Usage *struct {
			InputTokens              int `json:"input_tokens"`
			OutputTokens             int `json:"output_tokens"`
			CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
			CacheReadInputTokens     int `json:"cache_read_input_tokens"`
		} `json:"usage,omitempty"`
	} `json:"message,omitempty"`

	// For user events with tool results
	ToolUseResult *struct {
		Stdout string `json:"stdout,omitempty"`
		Stderr string `json:"stderr,omitempty"`
	} `json:"tool_use_result,omitempty"`

	// For result events
	Result  string `json:"result,omitempty"`
	IsError bool   `json:"is_error,omitempty"`
	Usage   *struct {
		InputTokens              int `json:"input_tokens"`
		OutputTokens             int `json:"output_tokens"`
		CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
		CacheReadInputTokens     int `json:"cache_read_input_tokens"`
	} `json:"usage,omitempty"`
}

// cleanEnvForCLI returns the current environment with CLAUDECODE unset so the
// CLI subprocess doesn't refuse to start when launched from inside a Claude Code session.
func cleanEnvForCLI() []string {
	var env []string
	for _, e := range os.Environ() {
		if !strings.HasPrefix(e, "CLAUDECODE=") {
			env = append(env, e)
		}
	}
	return env
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
	cmd.Env = cleanEnvForCLI()
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

func (c *ClaudeCodeProvider) Capabilities() ProviderCapability {
	return CapabilityChat | CapabilityToolExec
}

// ClaudeCodeSystemPrompt instructs Claude Code CLI to actually execute commands using tools
const ClaudeCodeSystemPrompt = `You are an AI assistant helping manage Kubernetes clusters through the KubeStellar Console.

IMPORTANT INSTRUCTIONS:
1. When asked to run kubectl commands, CHECK something, or ANALYZE something - you MUST actually execute the commands using the Bash tool. Do NOT just output commands as text.
2. Always use the Bash tool to run kubectl, helm, or other CLI commands - don't just show them as code blocks.
3. After executing commands, analyze the output and provide insights to the user.
4. If a command fails, explain why and suggest fixes.
5. Be proactive - if you need to check something, just do it.

You have access to:
- Bash tool for running commands (kubectl, helm, etc.)
- Read tool for reading files
- Write tool for creating files

When the user asks you to do something, ACTUALLY DO IT using the tools available. Don't just describe what you would do.`

// buildPromptWithHistory creates a prompt that includes conversation history for context
func (c *ClaudeCodeProvider) buildPromptWithHistory(req *ChatRequest) string {
	var sb strings.Builder

	// Use caller's system prompt if provided, otherwise default
	if req.SystemPrompt != "" {
		sb.WriteString(req.SystemPrompt)
	} else {
		sb.WriteString(ClaudeCodeSystemPrompt)
	}
	sb.WriteString("\n\n---\n\n")

	if len(req.History) > 0 {
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
	}

	sb.WriteString("User: ")
	sb.WriteString(req.Prompt)

	return sb.String()
}

// Chat executes a prompt using the Claude Code CLI (blocking, returns full response)
func (c *ClaudeCodeProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	// Use streaming internally but collect the full response
	var fullContent strings.Builder
	var finalResp *ChatResponse

	resp, err := c.StreamChatWithProgress(ctx, req, func(chunk string) {
		fullContent.WriteString(chunk)
	}, nil)

	if err != nil {
		return nil, err
	}

	finalResp = resp
	if finalResp.Content == "" {
		finalResp.Content = fullContent.String()
	}

	return finalResp, nil
}

// StreamChat streams responses via callback (implements AIProvider interface)
func (c *ClaudeCodeProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	return c.StreamChatWithProgress(ctx, req, onChunk, nil)
}

// StreamChatWithProgress streams chat with progress events for tool activity
func (c *ClaudeCodeProvider) StreamChatWithProgress(ctx context.Context, req *ChatRequest, onChunk func(chunk string), onProgress func(event StreamEvent)) (*ChatResponse, error) {
	if c.cliPath == "" {
		return nil, fmt.Errorf("claude CLI not found")
	}

	// Build prompt with history for context
	fullPrompt := c.buildPromptWithHistory(req)

	// Build command with streaming JSON output
	// -p (print mode) is required for stream-json
	// --verbose is required for stream-json in print mode
	// --dangerously-skip-permissions allows tool execution without prompts
	// --max-turns limits agentic loops (workaround for CLI bug with duplicate tool_use IDs)
	args := []string{
		"-p",
		"--output-format", "stream-json",
		"--verbose",
		"--dangerously-skip-permissions",
		"--max-turns", "25",
		fullPrompt,
	}

	// Set timeout
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, 5*time.Minute)
		defer cancel()
	}

	cmd := exec.CommandContext(ctx, c.cliPath, args...)
	cmd.Env = cleanEnvForCLI()

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to create stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start claude CLI: %w", err)
	}

	// Read stderr in background for error reporting
	var stderrContent strings.Builder
	go func() {
		scanner := bufio.NewScanner(stderr)
		for scanner.Scan() {
			stderrContent.WriteString(scanner.Text())
			stderrContent.WriteString("\n")
		}
	}()

	// Parse streaming JSON output
	var finalResult string
	var inputTokens, outputTokens int
	var lastToolOutput string // Capture last tool output in case of API error
	var lastToolName string
	var textContent strings.Builder // Accumulate text content

	scanner := bufio.NewScanner(stdout)
	// Increase buffer size for potentially large JSON lines
	buf := make([]byte, 0, 1024*1024) // 1MB buffer
	scanner.Buffer(buf, 10*1024*1024)  // 10MB max

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var event claudeCodeStreamEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			log.Printf("Warning: failed to parse stream event: %v (line: %s)", err, truncateString(line, 100))
			continue
		}

		switch event.Type {
		case "system":
			// Init event - can log available tools, MCP servers, etc.
			log.Printf("[Claude Code] Session initialized")

		case "tool_use":
			// Tool is being called
			lastToolName = event.Tool
			log.Printf("[Claude Code] Tool use: %s", event.Tool)
			if onProgress != nil {
				onProgress(StreamEvent{
					Type:  "tool_use",
					Tool:  event.Tool,
					Input: event.Input,
				})
			}

		case "tool_result":
			// Tool returned output - capture it in case API errors later
			lastToolOutput = event.Output
			// Also capture tool name from result if we missed it
			if event.Tool != "" && lastToolName == "" {
				lastToolName = event.Tool
			}
			log.Printf("[Claude Code] Tool result: %s (%d bytes)", event.Tool, len(event.Output))
			if onProgress != nil {
				onProgress(StreamEvent{
					Type:   "tool_result",
					Tool:   event.Tool,
					Output: truncateString(event.Output, 500), // Truncate large outputs
				})
			}

		case "user":
			// This event contains tool_result - parse it to capture output
			// The "user" event wraps tool results in the stream-json format
			if event.ToolUseResult != nil && event.ToolUseResult.Stdout != "" {
				lastToolOutput = event.ToolUseResult.Stdout
				log.Printf("[Claude Code] Captured tool output (%d bytes)", len(lastToolOutput))
			}
			// Also check message content for tool results
			if event.Message != nil {
				for _, content := range event.Message.Content {
					if content.Type == "tool_result" && content.Content != "" {
						lastToolOutput = content.Content
						log.Printf("[Claude Code] Captured tool result from message (%d bytes)", len(lastToolOutput))
					}
				}
			}

		case "assistant":
			// AI response content
			if event.Message != nil {
				for _, content := range event.Message.Content {
					if content.Type == "text" && content.Text != "" {
						// Check if this is an API error message
						if strings.Contains(content.Text, "API Error:") && strings.Contains(content.Text, "tool_use") {
							log.Printf("[Claude Code] API error detected, will use tool output if available")
							// Don't send the error as a chunk, we'll handle it below
							continue
						}
						textContent.WriteString(content.Text)
						if onChunk != nil {
							onChunk(content.Text)
						}
					}
				}
				// Track token usage from message
				if event.Message.Usage != nil {
					inputTokens = event.Message.Usage.InputTokens +
						event.Message.Usage.CacheCreationInputTokens +
						event.Message.Usage.CacheReadInputTokens
					outputTokens = event.Message.Usage.OutputTokens
				}
			}

		case "result":
			// Final result - check if it's an API error
			if event.IsError || strings.Contains(event.Result, "API Error:") {
				log.Printf("[Claude Code] Completed with error, will check for tool output fallback")
				// Don't use the error as the result, we'll use tool output fallback
			} else {
				finalResult = event.Result
			}
			if event.Usage != nil {
				inputTokens = event.Usage.InputTokens +
					event.Usage.CacheCreationInputTokens +
					event.Usage.CacheReadInputTokens
				outputTokens = event.Usage.OutputTokens
			}
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("Warning: scanner error: %v", err)
	}

	// Wait for command to complete
	if err := cmd.Wait(); err != nil {
		errMsg := err.Error()
		if stderrContent.Len() > 0 {
			errMsg = fmt.Sprintf("%s: %s", errMsg, stderrContent.String())
		}
		// Don't fail if we got a result - exit code might be non-zero for other reasons
		if finalResult == "" && textContent.Len() == 0 && lastToolOutput == "" {
			return nil, fmt.Errorf("claude CLI error: %s", errMsg)
		}
	}

	// Build the response content
	responseContent := finalResult
	if responseContent == "" {
		responseContent = textContent.String()
	}

	// If we have tool output but no final response (likely due to API error),
	// make a follow-up call to analyze the output (workaround for CLI bug)
	if responseContent == "" && lastToolOutput != "" {
		log.Printf("[Claude Code] API error recovery: making follow-up call to analyze tool output")

		// Build a follow-up prompt asking to analyze the output
		analysisPrompt := fmt.Sprintf(`The following command was executed and produced this output. Please analyze the results and provide a helpful summary for the user.

Command output:
%s

Provide a clear, concise analysis of what this output shows.`, lastToolOutput)

		// Make a simple non-agentic call to analyze the output (no tools)
		analysisArgs := []string{
			"-p",
			"--output-format", "stream-json",
			"--tools", "", // Disable all tools for pure text analysis
			"--dangerously-skip-permissions",
			analysisPrompt,
		}

		analysisCmd := exec.CommandContext(ctx, c.cliPath, analysisArgs...)
		analysisCmd.Env = cleanEnvForCLI()
		analysisStdout, err := analysisCmd.StdoutPipe()
		if err == nil {
			if startErr := analysisCmd.Start(); startErr == nil {
				analysisScanner := bufio.NewScanner(analysisStdout)
				analysisScanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

				for analysisScanner.Scan() {
					line := analysisScanner.Text()
					if line == "" {
						continue
					}
					var event claudeCodeStreamEvent
					if json.Unmarshal([]byte(line), &event) == nil {
						if event.Type == "assistant" && event.Message != nil {
							for _, content := range event.Message.Content {
								if content.Type == "text" && content.Text != "" {
									responseContent += content.Text
									if onChunk != nil {
										onChunk(content.Text)
									}
								}
							}
						} else if event.Type == "result" && event.Result != "" && !event.IsError {
							if responseContent == "" {
								responseContent = event.Result
								if onChunk != nil {
									onChunk(event.Result)
								}
							}
						}
					}
				}
				analysisCmd.Wait()
			}
		}

		// If analysis also failed, fall back to simple formatted output
		if responseContent == "" {
			log.Printf("[Claude Code] Analysis call also failed, using formatted output")
			responseContent = fmt.Sprintf("Here are the results:\n\n```\n%s\n```", lastToolOutput)
			if onChunk != nil {
				onChunk(responseContent)
			}
		}
	}

	return &ChatResponse{
		Content: responseContent,
		Agent:   c.Name(),
		TokenUsage: &ProviderTokenUsage{
			InputTokens:  inputTokens,
			OutputTokens: outputTokens,
			TotalTokens:  inputTokens + outputTokens,
		},
		Done: true,
	}, nil
}

// Refresh re-detects the CLI (useful if user installs it after startup)
func (c *ClaudeCodeProvider) Refresh() {
	c.detectCLI()
}

// truncateString truncates a string to maxLen characters
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
