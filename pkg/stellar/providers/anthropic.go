package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type AnthropicProvider struct {
	*OpenAICompatProvider
}

func NewAnthropicProvider(apiKey string) *AnthropicProvider {
	return &AnthropicProvider{
		OpenAICompatProvider: NewOpenAICompat("https://api.anthropic.com/v1", apiKey, "anthropic"),
	}
}

func (a *AnthropicProvider) Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	start := time.Now()
	messages := make([]map[string]string, 0, len(req.Messages))
	system := ""
	for _, m := range req.Messages {
		if m.Role == "system" {
			system += m.Content + "\n"
			continue
		}
		messages = append(messages, map[string]string{"role": m.Role, "content": m.Content})
	}
	payload := map[string]any{
		"model":       req.Model,
		"messages":    messages,
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
		"system":      system,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, a.BaseURL+"/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", a.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := a.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("anthropic request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("anthropic: unexpected status %d", resp.StatusCode)
	}
	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
		Model string `json:"model"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	content := ""
	if len(result.Content) > 0 {
		content = result.Content[0].Text
	}
	return &GenerateResponse{
		Content:      content,
		TokensInput:  result.Usage.InputTokens,
		TokensOutput: result.Usage.OutputTokens,
		Model:        result.Model,
		Provider:     "anthropic",
		DurationMs:   int(time.Since(start).Milliseconds()),
	}, nil
}
