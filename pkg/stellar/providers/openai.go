package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

const openAIChatCompletionsPath = "/chat/completions"

type OpenAICompatProvider struct {
	BaseURL string
	APIKey  string
	name    string
	client  *http.Client
}

func NewOpenAICompat(baseURL, apiKey, name string) *OpenAICompatProvider {
	return &OpenAICompatProvider{
		BaseURL: baseURL,
		APIKey:  apiKey,
		name:    name,
		client:  &http.Client{Timeout: providerHTTPTimeout},
	}
}

func (o *OpenAICompatProvider) Name() string { return o.name }

func (o *OpenAICompatProvider) IsAvailable(_ context.Context) bool {
	return o.APIKey != ""
}

func (o *OpenAICompatProvider) Generate(ctx context.Context, req GenerateRequest) (*GenerateResponse, error) {
	payload := map[string]any{
		"model":       req.Model,
		"messages":    req.Messages,
		"max_tokens":  req.MaxTokens,
		"temperature": req.Temperature,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("%s marshal: %w", o.name, err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.BaseURL+openAIChatCompletionsPath, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+o.APIKey)

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("%s request: %w", o.name, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("%s: unexpected status %d", o.name, resp.StatusCode)
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
		Model string `json:"model"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("%s decode: %w", o.name, err)
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("%s: no choices in response", o.name)
	}

	return &GenerateResponse{
		Content:      result.Choices[0].Message.Content,
		TokensInput:  result.Usage.PromptTokens,
		TokensOutput: result.Usage.CompletionTokens,
		Model:        result.Model,
		Provider:     o.name,
	}, nil
}
