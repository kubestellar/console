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
	openAIAPIURL      = "https://api.openai.com/v1/chat/completions"
	defaultOpenAIModel = "gpt-4-turbo"
)

// OpenAIProvider implements AIProvider for OpenAI GPT models
type OpenAIProvider struct {
	apiKey  string
	model   string
	client  *http.Client
}

// NewOpenAIProvider creates a new OpenAI provider
func NewOpenAIProvider() *OpenAIProvider {
	cm := GetConfigManager()
	return &OpenAIProvider{
		apiKey: cm.GetAPIKey("openai"),
		model:  cm.GetModel("openai", defaultOpenAIModel),
		client: &http.Client{},
	}
}

func (o *OpenAIProvider) Name() string        { return "openai" }
func (o *OpenAIProvider) DisplayName() string { return "GPT-4 (OpenAI)" }
func (o *OpenAIProvider) Provider() string    { return "openai" }
func (o *OpenAIProvider) Description() string {
	return "OpenAI GPT-4 - versatile assistant with strong coding and analysis capabilities"
}

func (o *OpenAIProvider) IsAvailable() bool {
	// Check dynamically in case key was added via settings
	// Also checks cached validity - returns false if key is known to be invalid
	return GetConfigManager().IsKeyAvailable("openai")
}

// Chat sends a message and returns the complete response
func (o *OpenAIProvider) Chat(ctx context.Context, req *ChatRequest) (*ChatResponse, error) {
	if !o.IsAvailable() {
		return nil, fmt.Errorf("OpenAI provider not configured - OPENAI_API_KEY not set")
	}

	messages := o.buildMessages(req)
	body := map[string]interface{}{
		"model":      o.model,
		"messages":   messages,
		"max_tokens": 4096,
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", openAIAPIURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	o.setHeaders(httpReq)

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(body))
	}

	var result openAIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	content := ""
	if len(result.Choices) > 0 {
		content = result.Choices[0].Message.Content
	}

	return &ChatResponse{
		Content: content,
		Agent:   o.Name(),
		TokenUsage: &ProviderTokenUsage{
			InputTokens:  result.Usage.PromptTokens,
			OutputTokens: result.Usage.CompletionTokens,
			TotalTokens:  result.Usage.TotalTokens,
		},
		Done: true,
	}, nil
}

// StreamChat sends a message and streams the response
func (o *OpenAIProvider) StreamChat(ctx context.Context, req *ChatRequest, onChunk func(chunk string)) (*ChatResponse, error) {
	if !o.IsAvailable() {
		return nil, fmt.Errorf("OpenAI provider not configured - OPENAI_API_KEY not set")
	}

	messages := o.buildMessages(req)
	body := map[string]interface{}{
		"model":       o.model,
		"messages":    messages,
		"max_tokens":  4096,
		"stream":      true,
		"stream_options": map[string]bool{
			"include_usage": true,
		},
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", openAIAPIURL, bytes.NewBuffer(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	o.setHeaders(httpReq)

	resp, err := o.client.Do(httpReq)
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

		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var event openAIStreamEvent
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		// Handle content delta
		if len(event.Choices) > 0 && event.Choices[0].Delta.Content != "" {
			chunk := event.Choices[0].Delta.Content
			fullContent.WriteString(chunk)
			if onChunk != nil {
				onChunk(chunk)
			}
		}

		// Handle usage (sent in final message)
		if event.Usage != nil {
			usage.InputTokens = event.Usage.PromptTokens
			usage.OutputTokens = event.Usage.CompletionTokens
			usage.TotalTokens = event.Usage.TotalTokens
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("error reading stream: %w", err)
	}

	return &ChatResponse{
		Content:    fullContent.String(),
		Agent:      o.Name(),
		TokenUsage: &usage,
		Done:       true,
	}, nil
}

func (o *OpenAIProvider) buildMessages(req *ChatRequest) []map[string]string {
	messages := make([]map[string]string, 0)

	// Add system prompt
	systemPrompt := req.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = DefaultSystemPrompt
	}
	messages = append(messages, map[string]string{
		"role":    "system",
		"content": systemPrompt,
	})

	// Add history
	for _, msg := range req.History {
		if msg.Role == "system" {
			continue
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

func (o *OpenAIProvider) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+GetConfigManager().GetAPIKey("openai"))
}

// OpenAI API response types
type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

type openAIStreamEvent struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage,omitempty"`
}
