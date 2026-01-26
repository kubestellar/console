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

// Chat executes a prompt using the Bob CLI
func (b *BobProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if b.cliPath == "" {
		return nil, fmt.Errorf("bob CLI not found")
	}

	// Build command: bob "prompt" -o json
	// Note: Using positional prompt (recommended) instead of -p flag (deprecated)
	args := []string{
		req.Prompt,
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

	if err := json.Unmarshal([]byte(output), &cliResp); err != nil {
		// Fall back to raw output if JSON parsing fails
		log.Printf("Warning: failed to parse bob CLI JSON response: %v", err)
		content = strings.TrimSpace(output)
	} else {
		content = cliResp.Result
		// Total input includes cache tokens
		inputTokens = cliResp.Usage.InputTokens + cliResp.Usage.CacheCreationInputTokens + cliResp.Usage.CacheReadInputTokens
		outputTokens = cliResp.Usage.OutputTokens
	}

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
