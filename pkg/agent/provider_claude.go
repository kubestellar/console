package agent

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const (
	claudeAPIURL     = "https://api.anthropic.com/v1/messages"
	claudeAPIVersion = "2023-06-01"
	defaultClaudeModel = "claude-opus-4-20250514"
)

// ClaudeProvider implements AIProvider for Anthropic Claude
type ClaudeProvider struct {
	apiKey  string
	model   string
	client  *http.Client
}

// NewClaudeProvider creates a new Claude provider
func NewClaudeProvider() *ClaudeProvider {
	cm := GetConfigManager()
	return &ClaudeProvider{
		apiKey: cm.GetAPIKey("claude"),
		model:  cm.GetModel("claude", defaultClaudeModel),
		client: &http.Client{},
	}
}

func (c *ClaudeProvider) Name() string        { return "claude" }
func (c *ClaudeProvider) DisplayName() string { return "Claude (Anthropic)" }
func (c *ClaudeProvider) Provider() string    { return "anthropic" }
func (c *ClaudeProvider) Description() string {
	return "Anthropic Claude - excellent for complex reasoning and Kubernetes expertise"
}

func (c *ClaudeProvider) IsAvailable() bool {
	// Check dynamically in case key was added via settings
	// Also checks cached validity - returns false if key is known to be invalid
	return GetConfigManager().IsKeyAvailable("claude")
}

// Chat sends a message and returns the complete response
func (c *ClaudeProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !c.IsAvailable() {
		return nil, fmt.Errorf("Claude provider not configured - ANTHROPIC_API_KEY not set")
	}

	messages := c.buildMessages(req)
	body := map[string]interface{}{
		"model":      c.model,
		"max_tokens": 4096,
		"messages":   messages,
	}

	if req.SystemPrompt != "" {
		body["system"] = req.SystemPrompt
	} else {
		body["system"] = DefaultSystemPrompt
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", claudeAPIURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result claudeResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	content := ""
	if len(result.Content) > 0 {
		content = result.Content[0].Text
	}

	return &ChatResponse{
		Content: content,
		Agent:   c.Name(),
		TokenUsage: &ProviderTokenUsage{
			InputTokens:  result.Usage.InputTokens,
			OutputTokens: result.Usage.OutputTokens,
			TotalTokens:  result.Usage.InputTokens + result.Usage.OutputTokens,
		},
		Done: true,
	}, nil
}

// StreamChat sends a message and streams the response
func (c *ClaudeProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if !c.IsAvailable() {
		return nil, fmt.Errorf("Claude provider not configured - ANTHROPIC_API_KEY not set")
	}

	messages := c.buildMessages(req)
	body := map[string]interface{}{
		"model":      c.model,
		"max_tokens": 4096,
		"messages":   messages,
		"stream":     true,
	}

	if req.SystemPrompt != "" {
		body["system"] = req.SystemPrompt
	} else {
		body["system"] = DefaultSystemPrompt
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", claudeAPIURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	c.setHeaders(httpReq)

	resp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var fullContent strings.Builder
	var usage ProviderTokenUsage

	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()

		// Skip empty lines and non-data lines
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var event claudeStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		switch event.Type {
		case "content_block_delta":
			if event.Delta != nil && event.Delta.Text != "" {
				fullContent.WriteString(event.Delta.Text)
				if onChunk != nil {
					onChunk(event.Delta.Text)
				}
			}
		case "message_delta":
			if event.Usage != nil {
				usage.OutputTokens = event.Usage.OutputTokens
			}
		case "message_start":
			if event.Message != nil && event.Message.Usage != nil {
				usage.InputTokens = event.Message.Usage.InputTokens
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading stream: %w", err)
	}

	usage.TotalTokens = usage.InputTokens + usage.OutputTokens

	return &ChatResponse{
		Content:    fullContent.String(),
		Agent:      c.Name(),
		TokenUsage: &usage,
		Done:       true,
	}, nil
}

func (c *ClaudeProvider) buildMessages(req *ChatRequest) []map[string]string {
	messages := make([]map[string]string, 0)

	// Add history
	for _, msg := range req.History {
		if msg.Role == "system" {
			continue // System messages handled separately
		}
		messages = append(messages, map[string]string{
			"role":    msg.Role,
			"content": msg.Content,
		})
	}

	// Add current prompt
	messages = append(messages, map[string]string{
		"role":    "user",
		"content": req.Prompt,
	})

	return messages
}

func (c *ClaudeProvider) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", GetConfigManager().GetAPIKey("claude"))
	req.Header.Set("anthropic-version", claudeAPIVersion)
}

// Claude API response types
type claudeResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

type claudeStreamEvent struct {
	Type    string `json:"type"`
	Delta   *struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"delta,omitempty"`
	Usage   *struct {
		OutputTokens int `json:"output_tokens"`
	} `json:"usage,omitempty"`
	Message *struct {
		Usage *struct {
			InputTokens int `json:"input_tokens"`
		} `json:"usage,omitempty"`
	} `json:"message,omitempty"`
}
