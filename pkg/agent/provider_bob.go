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

// bobResponse represents the JSON output from bob CLI
type bobResponse struct {
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

// cleanBobOutput removes debug lines and markers from Bob CLI output
func cleanBobOutput(content string) string {
	lines := strings.Split(content, "\n")
	var cleanLines []string
	skipNext := false

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Skip debug lines
		if strings.Contains(line, "loaded global modes") ||
			strings.Contains(line, "loaded project modes") ||
			trimmed == "---output---" ||
			strings.HasPrefix(trimmed, "{\"type\":") ||
			strings.HasPrefix(trimmed, "{\"error\":") {
			continue
		}

		// Skip JSON stats block at the end
		if strings.HasPrefix(trimmed, "{") && strings.Contains(trimmed, "\"usage\"") {
			skipNext = true
			continue
		}
		if skipNext {
			continue
		}

		cleanLines = append(cleanLines, line)
	}

	return strings.TrimSpace(strings.Join(cleanLines, "\n"))
}

// BobProvider uses the local Bob CLI installation (Claude OEM)
type BobProvider struct {
	cliPath string
	version string
}

// NewBobProvider creates a new Bob CLI provider
func NewBobProvider() *BobProvider {
	provider := &BobProvider{}
	provider.detectCLI()
	return provider
}

// detectCLI checks if bob CLI is installed and gets its version
func (b *BobProvider) detectCLI() {
	// Try to find bob in PATH first
	path, err := exec.LookPath("bob")
	if err != nil {
		// Check common installation locations
		commonPaths := []string{
			os.ExpandEnv("$HOME/.local/bin/bob"),
			"/usr/local/bin/bob",
			"/opt/homebrew/bin/bob",
			os.ExpandEnv("$HOME/.bob/bin/bob"),
			// nvm installations
			os.ExpandEnv("$HOME/.nvm/versions/node/v22.22.0/bin/bob"),
			os.ExpandEnv("$HOME/.nvm/versions/node/v20.18.0/bin/bob"),
			os.ExpandEnv("$HOME/.nvm/versions/node/v18.20.0/bin/bob"),
		}
		for _, p := range commonPaths {
			if _, statErr := os.Stat(p); statErr == nil {
				path = p
				log.Printf("Found Bob CLI at: %s", p)
				break
			}
		}
		if path == "" {
			log.Printf("Bob CLI not found in PATH or common locations")
			return
		}
	} else {
		log.Printf("Found Bob CLI in PATH: %s", path)
	}
	b.cliPath = path

	// Get version
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, path, "--version")
	output, err := cmd.Output()
	if err == nil {
		b.version = strings.TrimSpace(string(output))
		log.Printf("Bob CLI version: %s", b.version)
	} else {
		log.Printf("Could not get Bob CLI version: %v", err)
	}
}

// Name returns the provider identifier
func (b *BobProvider) Name() string {
	return "bob"
}

// DisplayName returns the human-readable name
func (b *BobProvider) DisplayName() string {
	return "Bob (Local)"
}

// Description returns the provider description
func (b *BobProvider) Description() string {
	if b.version != "" {
		return fmt.Sprintf("Local Bob CLI with MCP tools - v%s", b.version)
	}
	return "Local Bob CLI with MCP tools"
}

// Provider returns the provider type for icon selection
func (b *BobProvider) Provider() string {
	return "bob"
}

// IsAvailable returns true if the CLI is installed
func (b *BobProvider) IsAvailable() bool {
	return b.cliPath != ""
}

// buildPromptWithHistory creates a prompt that includes conversation history for context
func (b *BobProvider) buildPromptWithHistory(req *ChatRequest) string {
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

// Chat executes a prompt using the Bob CLI
func (b *BobProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if b.cliPath == "" {
		return nil, fmt.Errorf("bob CLI not found")
	}

	// Build prompt with history for context
	fullPrompt := b.buildPromptWithHistory(req)

	// Build command: bob "prompt" -o json
	// Note: Using positional prompt (recommended) instead of -p flag (deprecated)
	args := []string{
		fullPrompt,
		"-o", "json",
	}

	cmd := exec.CommandContext(ctx, b.cliPath, args...)

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
		return nil, fmt.Errorf("bob CLI error: %s", errMsg)
	}

	output := stdout.String()
	if output == "" && stderr.Len() > 0 {
		// Sometimes output goes to stderr
		output = stderr.String()
	}

	// Parse JSON response to extract content and token usage
	var cliResp bobResponse
	var content string
	var inputTokens, outputTokens int

	// First, try to extract content from ---output--- markers (most reliable)
	outputMarker := "---output---"
	startIdx := strings.Index(output, outputMarker)
	if startIdx >= 0 {
		afterMarker := output[startIdx+len(outputMarker):]
		// Find the end marker or the JSON stats block at the end
		endIdx := strings.Index(afterMarker, outputMarker)
		if endIdx < 0 {
			// Look for JSON stats at end (starts with newline + {)
			endIdx = strings.LastIndex(afterMarker, "\n{")
			if endIdx < 0 {
				endIdx = strings.LastIndex(afterMarker, "{")
			}
		}
		if endIdx > 0 {
			content = strings.TrimSpace(afterMarker[:endIdx])
		} else {
			content = strings.TrimSpace(afterMarker)
		}
	}

	// Try to find JSON stats at the end for token usage
	jsonStart := strings.LastIndex(output, "\n{")
	if jsonStart < 0 {
		jsonStart = strings.LastIndex(output, "{")
	}
	if jsonStart >= 0 {
		jsonOutput := output[jsonStart:]
		if err := json.Unmarshal([]byte(strings.TrimSpace(jsonOutput)), &cliResp); err == nil {
			inputTokens = cliResp.Usage.InputTokens + cliResp.Usage.CacheCreationInputTokens + cliResp.Usage.CacheReadInputTokens
			outputTokens = cliResp.Usage.OutputTokens
			// If we didn't get content from markers, try from JSON
			if content == "" && cliResp.Result != "" {
				content = cliResp.Result
			}
		}
	}

	// Final fallback: use cleaned raw output
	if content == "" {
		content = output
	}

	// Always clean the content to remove debug lines and markers
	content = cleanBobOutput(content)

	return &ChatResponse{
		Content: content,
		Agent:   b.Name(),
		TokenUsage: &ProviderTokenUsage{
			InputTokens:  inputTokens,
			OutputTokens: outputTokens,
			TotalTokens:  inputTokens + outputTokens,
		},
		Done: true,
	}, nil
}

// StreamChat streams responses - for CLI we just return the full response
func (b *BobProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	// CLI doesn't support true streaming, so we execute and return the full response
	resp, err := b.Chat(ctx, req)
	if err != nil {
		return nil, err
	}

	// Send the complete response as a single chunk
	onChunk(resp.Content)

	return resp, nil
}

// Refresh re-detects the CLI (useful if user installs it after startup)
func (b *BobProvider) Refresh() {
	b.detectCLI()
}
