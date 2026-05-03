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

// openAICompatMaxTokens is the default max_tokens value for non-streaming and
// streaming chat requests against OpenAI-compatible endpoints. Chosen to match
// the original hardcoded value used by the OpenAI, OpenWebUI and other OpenAI-
// compatible providers.
const openAICompatMaxTokens = 4096

// chatViaOpenAICompatible sends a chat request to an OpenAI-compatible endpoint.
// For endpoints that need extra request headers (e.g. OpenRouter's HTTP-Referer
// and X-Title) or a default model, use chatViaOpenAICompatibleWithHeaders.
func chatViaOpenAICompatible(ctx context.Context, req *ChatRequest, providerKey, endpoint, agentName string) (*ChatResponse, error) {
	return chatViaOpenAICompatibleWithHeaders(ctx, req, providerKey, endpoint, agentName, "", nil)
}

// chatViaOpenAICompatibleWithHeaders is like chatViaOpenAICompatible but lets
// the caller inject a default model (used when neither env nor config sets
// one) and additional request headers such as HTTP-Referer / X-Title.
func chatViaOpenAICompatibleWithHeaders(ctx context.Context, req *ChatRequest, providerKey, endpoint, agentName, defaultModel string, extraHeaders map[string]string) (*ChatResponse, error) {
	cm := GetConfigManager()
	apiKey := cm.GetAPIKey(providerKey)
	if apiKey == "" {
		return nil, fmt.Errorf("API key not configured for provider %s", providerKey)
	}
	model := cm.GetModel(providerKey, defaultModel)

	messages := buildOpenAIMessages(req)

	body := map[string]any{
		"messages":   messages,
		"max_tokens": openAICompatMaxTokens,
	}
	if model != "" {
		body["model"] = model
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	for k, v := range extraHeaders {
		if k == "" || v == "" {
			continue
		}
		httpReq.Header.Set(k, v)
	}

	resp, err := newAIProviderHTTPClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
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
			TotalTokens      int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	content := ""
	if len(result.Choices) > 0 {
		content = result.Choices[0].Message.Content
	}

	return &ChatResponse{
		Content: content,
		Agent:   agentName,
		TokenUsage: &ProviderTokenUsage{
			InputTokens:  result.Usage.PromptTokens,
			OutputTokens: result.Usage.CompletionTokens,
			TotalTokens:  result.Usage.TotalTokens,
		},
		Done: true,
	}, nil
}

// streamViaOpenAICompatible streams a chat response from an OpenAI-compatible
// endpoint. For endpoints that need extra request headers or a default model,
// use streamViaOpenAICompatibleWithHeaders.
func streamViaOpenAICompatible(ctx context.Context, req *ChatRequest, providerKey, endpoint, agentName string, onChunk func(chunk string)) (*ChatResponse, error) {
	return streamViaOpenAICompatibleWithHeaders(ctx, req, providerKey, endpoint, agentName, "", onChunk, nil)
}

// streamViaOpenAICompatibleWithHeaders is like streamViaOpenAICompatible but
// lets the caller inject a default model and additional request headers.
func streamViaOpenAICompatibleWithHeaders(ctx context.Context, req *ChatRequest, providerKey, endpoint, agentName, defaultModel string, onChunk func(chunk string), extraHeaders map[string]string) (*ChatResponse, error) {
	cm := GetConfigManager()
	apiKey := cm.GetAPIKey(providerKey)
	if apiKey == "" {
		return nil, fmt.Errorf("API key not configured for provider %s", providerKey)
	}
	model := cm.GetModel(providerKey, defaultModel)

	messages := buildOpenAIMessages(req)

	body := map[string]any{
		"messages":   messages,
		"max_tokens": openAICompatMaxTokens,
		"stream":     true,
	}
	if model != "" {
		body["model"] = model
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+apiKey)
	for k, v := range extraHeaders {
		if k == "" || v == "" {
			continue
		}
		httpReq.Header.Set(k, v)
	}

	resp, err := newAIProviderHTTPClient().Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxLLMResponseBytes))
		return nil, fmt.Errorf("API returned status %d: %s", resp.StatusCode, string(respBody))
	}

	var fullContent strings.Builder
	var tokenUsage ProviderTokenUsage

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

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
			Usage *struct {
				PromptTokens     int `json:"prompt_tokens"`
				CompletionTokens int `json:"completion_tokens"`
				TotalTokens      int `json:"total_tokens"`
			} `json:"usage"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			content := chunk.Choices[0].Delta.Content
			fullContent.WriteString(content)
			if onChunk != nil {
				onChunk(content)
			}
		}

		if chunk.Usage != nil {
			tokenUsage = ProviderTokenUsage{
				InputTokens:  chunk.Usage.PromptTokens,
				OutputTokens: chunk.Usage.CompletionTokens,
				TotalTokens:  chunk.Usage.TotalTokens,
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("stream read error: %w", err)
	}

	return &ChatResponse{
		Content:    fullContent.String(),
		Agent:      agentName,
		TokenUsage: &tokenUsage,
		Done:       true,
	}, nil
}

// buildOpenAIMessages converts a ChatRequest to OpenAI message format
func buildOpenAIMessages(req *ChatRequest) []map[string]string {
	var messages []map[string]string

	systemPrompt := req.SystemPrompt
	if systemPrompt == "" {
		systemPrompt = DefaultSystemPrompt
	}
	messages = append(messages, map[string]string{"role": "system", "content": systemPrompt})

	for _, msg := range req.History {
		messages = append(messages, map[string]string{"role": msg.Role, "content": msg.Content})
	}

	messages = append(messages, map[string]string{"role": "user", "content": req.Prompt})
	return messages
}
